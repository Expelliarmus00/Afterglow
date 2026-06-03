<?php
/* ============================================================
   AFTERGLOW BY KEVIN — Endpoint de contact / devis
   Reçoit le POST du tunnel (contact.html), valide, envoie un
   e-mail et journalise la demande. Aucune dépendance externe.

   DÉPLOIEMENT VPS (Nginx + PHP-FPM) :
   - Placer ce fichier à la racine du site, à côté de contact.html.
   - Vérifier que PHP peut envoyer du mail (sendmail/postfix installé),
     OU brancher un SMTP (voir la section SMTP plus bas).
   - Adapter $TO ci-dessous si besoin.
   - Le dossier doit être inscriptible pour le journal CSV (ou
     désactiver la journalisation en mettant $LOG_FILE = null).
   ============================================================ */

$TO        = "info@snapshotmedia.ch";          // destinataire des demandes
$FROM      = "site@afterglowbykevin.ch";       // expéditeur technique (domaine du site)
$SUBJECT_P = "[Afterglow] Demande de devis — "; // préfixe du sujet
$SITE_NAME = "Afterglow by Kevin";              // nom du site (affiché dans l'e-mail)
$LOG_FILE  = __DIR__ . "/contact-log.csv";     // mettre à null pour désactiver

header("Content-Type: application/json; charset=utf-8");

/* --- N'accepter que le POST --- */
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "method"]);
  exit;
}

/* --- Lire le corps (JSON ou formulaire) --- */
$raw  = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!is_array($data)) { $data = $_POST; }

function field($d, $k) { return isset($d[$k]) ? trim((string)$d[$k]) : ""; }

$honeypot = field($data, "website");           // piège anti-bot (doit rester vide)
$nom      = field($data, "nom");
$email    = field($data, "email");
$tel      = field($data, "tel");
$type     = field($data, "type");
$formule  = field($data, "formule");
$date     = field($data, "date");
$region   = field($data, "region");
$message  = field($data, "message");

/* --- Anti-spam : si le honeypot est rempli, on fait semblant d'accepter --- */
if ($honeypot !== "") {
  echo json_encode(["ok" => true]);
  exit;
}

/* --- Validation minimale --- */
$errors = [];
if ($nom === "")                                   $errors["nom"]   = "Nom requis.";
if (!filter_var($email, FILTER_VALIDATE_EMAIL))    $errors["email"] = "Email invalide.";
if (!empty($errors)) {
  http_response_code(422);
  echo json_encode(["ok" => false, "errors" => $errors]);
  exit;
}

/* --- Construire le corps de l'e-mail --- */
$lines = [
  "Nouvelle demande reçue depuis " . $SITE_NAME . " (afterglowbykevin.ch)",
  "----------------------------------------------------------------",
  "Prestation : " . ($type ?: "—"),
  "Formule    : " . ($formule ?: "—"),
  "Date       : " . ($date ?: "—"),
  "Lieu       : " . ($region ?: "—"),
  "",
  "Nom        : " . $nom,
  "Email      : " . $email,
  "Téléphone  : " . ($tel ?: "—"),
  "",
  "Message :",
  ($message ?: "—"),
  "",
  "----------------------------------------------------------------",
  "IP : " . ($_SERVER["REMOTE_ADDR"] ?? "—") . " · " . date("c"),
  "Envoyé via le formulaire de contact de " . $SITE_NAME,
];
$body = implode("\n", $lines);

$subject = $SUBJECT_P . ($type ?: "Projet photo");

/* --- En-têtes (Reply-To = le client, pour répondre directement) --- */
$headers  = "From: Kevin Chinelli <{$FROM}>\r\n";
$headers .= "Reply-To: " . preg_replace('/[\r\n]+/', ' ', $nom . " <" . $email . ">") . "\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";
$headers .= "MIME-Version: 1.0\r\n";

/* --- Journaliser (CSV) même si l'e-mail échoue --- */
if ($LOG_FILE) {
  $row = [date("c"), $type, $formule, $date, $region, $nom, $email, $tel, str_replace(["\r","\n"], " ", $message)];
  $fh = @fopen($LOG_FILE, "a");
  if ($fh) { @fputcsv($fh, $row); @fclose($fh); }
}

/* --- Envoi --- */
$sent = @mail($TO, "=?UTF-8?B?" . base64_encode($subject) . "?=", $body, $headers);

if ($sent) {
  echo json_encode(["ok" => true]);
} else {
  /* L'e-mail a échoué mais la demande est journalisée : on le signale
     au front, qui basculera sur le repli mailto. */
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "mail"]);
}

/* ============================================================
   OPTION SMTP (recommandé en production pour la délivrabilité)
   ------------------------------------------------------------
   mail() dépend de la config locale et finit souvent en spam.
   Pour un envoi fiable, utiliser un SMTP authentifié via
   PHPMailer (composer require phpmailer/phpmailer) :

     use PHPMailer\PHPMailer\PHPMailer;
     $m = new PHPMailer(true);
     $m->isSMTP();
     $m->Host = "smtp.votre-fournisseur.ch";
     $m->SMTPAuth = true;
     $m->Username = "site@kevinchinelli.ch";
     $m->Password = "********";
     $m->SMTPSecure = "tls"; $m->Port = 587;
     $m->setFrom($FROM, "Kevin Chinelli");
     $m->addAddress($TO);
     $m->addReplyTo($email, $nom);
     $m->Subject = $subject; $m->Body = $body;
     $m->send();

   Hostinger fournit un SMTP par domaine — paramètres dans hPanel.
   ============================================================ */
