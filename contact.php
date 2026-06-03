<?php
/* ============================================================
   AFTERGLOW BY KEVIN — Endpoint de contact / devis
   Utilise PHPMailer + SMTP Infomaniak pour l'envoi.
   Les identifiants SMTP sont dans smtp-config.php (hors git).
   ============================================================ */

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/smtp-config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$TO        = "info@snapshotmedia.ch";
$FROM      = SMTP_USER;
$SUBJECT_P = "[Afterglow] Demande de devis — ";
$SITE_NAME = "Afterglow by Kevin";
$LOG_FILE  = __DIR__ . "/contact-log.csv";

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "method"]);
  exit;
}

$raw  = file_get_contents("php://input");
$data = json_decode($raw, true);
if (!is_array($data)) { $data = $_POST; }

function field($d, $k) { return isset($d[$k]) ? trim((string)$d[$k]) : ""; }

$honeypot = field($data, "website");
$nom      = field($data, "nom");
$email    = field($data, "email");
$tel      = field($data, "tel");
$type     = field($data, "type");
$formule  = field($data, "formule");
$date     = field($data, "date");
$region   = field($data, "region");
$message  = field($data, "message");

if ($honeypot !== "") {
  echo json_encode(["ok" => true]);
  exit;
}

$errors = [];
if ($nom === "")                                   $errors["nom"]   = "Nom requis.";
if (!filter_var($email, FILTER_VALIDATE_EMAIL))    $errors["email"] = "Email invalide.";
if (!empty($errors)) {
  http_response_code(422);
  echo json_encode(["ok" => false, "errors" => $errors]);
  exit;
}

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
$body    = implode("\n", $lines);
$subject = $SUBJECT_P . ($type ?: "Projet photo");

if ($LOG_FILE) {
  $row = [date("c"), $type, $formule, $date, $region, $nom, $email, $tel, str_replace(["\r","\n"], " ", $message)];
  $fh = @fopen($LOG_FILE, "a");
  if ($fh) { @fputcsv($fh, $row); @fclose($fh); }
}

$mail = new PHPMailer(true);
try {
  $mail->isSMTP();
  $mail->Host       = SMTP_HOST;
  $mail->SMTPAuth   = true;
  $mail->Username   = SMTP_USER;
  $mail->Password   = SMTP_PASS;
  $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
  $mail->Port       = SMTP_PORT;
  $mail->CharSet    = 'UTF-8';

  $mail->setFrom($FROM, $SITE_NAME);
  $mail->addAddress($TO);
  $mail->addReplyTo($email, $nom);

  $mail->Subject = $subject;
  $mail->Body    = $body;

  $mail->send();
  echo json_encode(["ok" => true]);
} catch (Exception $e) {
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "mail"]);
}
