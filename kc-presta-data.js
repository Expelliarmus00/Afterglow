/* ============================================================
   KEVIN CHINELLI — contenu des prestations (FR · Suisse romande)
   Plain data, exposed as window.KC_PRESTA[slug].
   Tarifs alignés sur le marché romand (CHF) — ajustables sur devis.
   ============================================================ */
window.KC_PRESTA = {

  /* ====================== MARIAGES ====================== */
  mariage: {
    slug: "mariage", title: "Mariages", crumb: "Mariages", heroDefault: "bas",
    heroImg: "Photo hero — couple, cérémonie en extérieur",
    heroHint: "Photographe de mariage en Suisse romande — du premier regard au dernier éclat de rire.",
    intro: {
      lead: "Un mariage ne se rejoue pas. Mon travail consiste à en garder la trace juste — les gestes, les regards, les fous rires — sans jamais m'interposer entre vous et votre journée.",
      paragraphs: [
        "Je photographie en reportage, à hauteur d'émotion. Concrètement : pas de longue séance de poses qui vous coupe de vos invités, peu de mises en scène, beaucoup d'attention portée aux instants qui passent vite — le regard d'un parent, la main qui tremble pendant les vœux, la piste de danse à minuit. Je prévois une courte parenthèse à deux, à l'heure dorée, pour quelques images plus posées : c'est souvent le seul vrai moment de calme de la journée.",
        "Je travaille en lumière naturelle autant que possible, avec un matériel discret et un second boîtier toujours prêt. Sur les formules avec couverture longue, un second photographe permet de saisir en simultané la mariée et le marié, ou la cérémonie sous deux angles.",
        "Après le jour J, chaque image est triée puis retouchée une à une — colorimétrie, lumière, peau — pour un rendu fidèle et intemporel. Vous recevez une galerie privée à télécharger en pleine résolution, sans filigrane, avec vos droits d'usage privé.",
      ],
      quote: "« Le plus beau des sourires est celui que l'on ne prépare pas. »",
    },
    gallery: [
      { ph: "Préparatifs — détails de la robe", o: "v" },
      { ph: "Regard de la mariée", o: "v" },
      { ph: "Cérémonie — échange des vœux", o: "v" },
      { ph: "Alliances", o: "v" },
      { ph: "Sortie sous les pétales", o: "v" },
      { ph: "Couple — golden hour", o: "h" },
      { ph: "Émotion d'un invité", o: "v" },
      { ph: "Détails du lieu / décor", o: "v" },
      { ph: "Première danse", o: "h" },
      { ph: "Fin de soirée", o: "v" },
    ],
    formules: [
      { tag: "Demi-journée · 4 h", name: "Essentiel", price: "dès CHF 1'690",
        items: ["Couverture 4 h continues — cérémonie & vin d'honneur", "Galerie privée en ligne, téléchargement HD", "Env. 200 photos, toutes retouchées"] },
      { tag: "Le plus choisi · 10 h", name: "Signature", price: "dès CHF 2'990", feature: true,
        items: ["Couverture 10 h, des préparatifs à la soirée", "Séance engagement offerte", "Galerie privée + sélection de favoris", "Env. 500 photos, toutes retouchées"] },
      { tag: "Sur mesure · 2 jours", name: "Prestige", price: "dès CHF 4'500",
        items: ["Présence sur 2 jours (veille / brunch)", "Second photographe", "Séance engagement offerte", "Album fine art relié 30×30", "Tirage fine art — format à votre choix", "Livraison express sous 10 jours"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "Un appel ou un café pour faire connaissance, comprendre votre histoire, votre lieu et vérifier mes disponibilités sur votre date." },
      { n: "02", title: "Repérage & déroulé", text: "On cale ensemble le timing de la journée, les moments à ne pas manquer et, si besoin, on visite les lieux pour anticiper la lumière." },
      { n: "03", title: "Le jour J", text: "Je suis là tôt, en retrait, à l'écoute. Je connais le déroulé par cœur pour saisir l'instant sans jamais avoir à le provoquer." },
      { n: "04", title: "Tri & livraison", text: "Une sélection de 10 photos pour vos réseaux livrée sous 3 à 5 jours. La galerie complète, toutes photos retouchées, est disponible sous 4 semaines (10 jours en formule Prestige)." },
    ],
    inclus: [
      "Appel préparatoire et conseils déroulé", "Repérage des lieux si besoin",
      "Galerie privée en ligne, téléchargement HD", "Toutes les photos livrées retouchées une à une",
      "Sélection réseaux sociaux livrée sous 3–5 jours", "Droits d'usage privé inclus",
      "Double sauvegarde sécurisée pendant 1 an", "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Kevin a capturé notre mariage avec une justesse rare. Chaque image raconte précisément ce que nous avons ressenti ce jour-là.", who: "Camille & Thomas, Lavaux" },
      { quote: "Discret toute la journée, et pourtant rien ne lui a échappé. Nos photos sont d'une élégance folle.", who: "Sophie & Julien, Fribourg" },
    ],
    faq: [
      { q: "Dans quelles régions vous déplacez-vous ?", a: "Je me déplace avec plaisir pour tout mariage en Suisse romande et au-delà. Le déplacement est offert dans un rayon de 30 km autour de Mézières (VD) — ce qui couvre la grande région lausannoise. Pour les principales villes romandes (Lausanne, Genève, Montreux, Fribourg…), un forfait déplacement est intégré directement dans la formule, sans surprise. Pour un mariage à l'étranger, transport et hébergement sont détaillés clairement dans le devis." },
      { q: "Photographiez-vous plusieurs mariages le même jour ?", a: "Jamais. Je ne réserve qu'un seul mariage par date : vous avez ma disponibilité et mon énergie du matin jusqu'à la fin de soirée." },
      { q: "Qu'est-ce qu'une séance d'engagement ?", a: "C'est une séance de couple, incluse dans les formules Signature et Prestige, réalisée quelques semaines ou mois avant le mariage. On se retrouve une petite heure dans un lieu qui vous ressemble pour des photos détendues, rien que vous deux. L'intérêt est double : vous repartez avec de belles images à utiliser pour votre faire-part, votre site de mariage ou un tirage — et surtout, vous prenez vos marques avec ma façon de travailler. Le jour J, l'appareil est déjà familier et vous êtes naturels devant l'objectif." },
      { q: "Combien de photos recevons-nous, et quand ?", a: "Selon la formule, de 200 à 500+ photos — toutes retouchées, en pleine résolution. Ces nombres sont une estimation, pas un engagement contractuel : je tiens avant tout à ce que chaque image soit juste et aboutie. Je cherche la qualité, pas la quantité — selon le déroulé de la journée, certaines galeries dépassent largement ces repères, d'autres les approchent. Vous recevez une sélection de 10 images sous 3 à 5 jours (parfait pour vos réseaux), puis la galerie complète sous 4 semaines (10 jours en formule Prestige)." },
      { q: "Que se passe-t-il s'il pleut ?", a: "On prévoit toujours un plan B avec vous au repérage : un abri couvert, une arche, une grange ou un coin du lieu de réception. La pluie offre souvent les images les plus tendres — parapluie transparent à l'appui." },
      { q: "Proposez-vous un album et des tirages ?", a: "Oui. Albums fine art reliés à la main (papier mat ou brillant, couverture lin ou cuir) et tirages d'art encadrés, sur devis. C'est, de loin, ce qui traverse le mieux les années." },
      { q: "Comment réserver notre date ?", a: "La date est bloquée à la signature du contrat et au versement d'un acompte de 30 %. Le solde est réglé une semaine avant le mariage. Je conseille de réserver 8 à 14 mois à l'avance pour les samedis de mai à septembre." },
    ],
  },

  /* ====================== PORTRAITS ====================== */
  portrait: {
    slug: "portrait", title: "Portraits", crumb: "Portraits", heroDefault: "bas",
    heroImg: "Photo hero — portrait en lumière naturelle, extérieur",
    heroHint: "Photographe portrait en Suisse romande, en lumière naturelle.",
    intro: {
      lead: "Une séance portrait, c'est un cadeau qu'on se fait à soi-même : un temps suspendu, rien que pour vous, et des images qui vous ressemblent vraiment.",
      paragraphs: [
        "On commence par marcher et discuter, le temps que l'appareil se fasse oublier. Je vous donne des indications simples et précises — où poser le regard, quoi faire de vos mains — pour que vous n'ayez jamais à « prendre la pose ». Les plus belles images arrivent presque toujours entre deux consignes, quand vous redevenez tout simplement vous-même.",
        "On repousse si souvent les belles photos de soi à « plus tard » : au bon moment, à quand on sera prêt, à quand on aura le temps. Ce moment, c'est maintenant. S'offrir une séance, c'est s'accorder le droit de se voir autrement, de prendre soin de son image et de garder une trace juste de qui l'on est aujourd'hui.",
        "Je travaille la lumière naturelle, en extérieur ou dans un lieu qui compte pour vous : un quai du Léman à Lausanne, une ruelle de la vieille ville de Genève, votre atelier ou votre intérieur. Portrait personnel, artistique ou pour votre image professionnelle, le cadre s'adapte à l'usage que vous ferez des photos. Vous repartez avec une galerie privée et des fichiers haute définition, prêts pour l'impression comme pour le web.",
      ],
      quote: "« Un visage en dit toujours plus qu'un long discours. »",
    },
    gallery: [
      { ph: "Portrait extérieur — lumière douce", o: "v" },
      { ph: "Regard franc", o: "v" },
      { ph: "Portrait en pied", o: "v" },
      { ph: "Lumière de fin de journée", o: "h" },
      { ph: "Profil — contre-jour", o: "v" },
      { ph: "Attitude lifestyle", o: "v" },
      { ph: "En mouvement", o: "h" },
    ],
    formules: [
      { tag: "Découverte · 30 min", name: "Essentiel", price: "CHF 240",
        items: ["1 lieu extérieur", "10 photos retouchées", "Galerie privée en ligne"] },
      { tag: "Le plus choisi · 1 h", name: "Signature", price: "CHF 340", feature: true,
        items: ["2 lieux (intérieur ou extérieur) ou 2 ambiances proches", "25 photos retouchées", "Galerie privée en ligne"] },
      { tag: "Pro & image de marque", name: "Corporate", price: "Sur devis",
        items: ["Portraits pro & personal branding", "Extérieur, intérieur ou studio", "Portraits d'équipe possibles", "Droits d'usage commercial inclus", "Volume & délai selon vos besoins"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On clarifie l'usage des images, l'ambiance recherchée et le lieu qui vous correspond le mieux." },
      { n: "02", title: "Préparation", text: "Conseils tenues, couleurs et repérage : tout est prêt pour que la séance soit fluide et vous ressemble." },
      { n: "03", title: "La séance", text: "Décontractée et guidée. Je vous dirige avec justesse, vous restez vous-même — et on s'amuse." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, fichiers prêts à l'emploi, web et impression." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils lieu, tenues & couleurs", "Direction de pose bienveillante",
      "Toutes les photos livrées retouchées", "Fichiers web et impression HD", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Je me trouve enfin à mon avantage sur une photo. Naturel, juste, sans surjeu.", who: "Sarah, Lausanne" },
      { quote: "Des portraits qui me ressemblent vraiment — je les utilise partout, du site au LinkedIn.", who: "Damien, Genève" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — quais de Lausanne, vieille ville de Genève, vignobles de Lavaux, forêt, bord de lac, ou votre intérieur — ou dans un cadre que je vous propose selon l'ambiance souhaitée. Je me déplace dans tout le canton de Vaud, à Genève, Fribourg, Neuchâtel et alentours." },
      { q: "Portrait extérieur ou studio, comment choisir ?", a: "Le portrait en extérieur, en lumière naturelle, donne un rendu vivant et personnel. Le studio offre un cadre maîtrisé, idéal pour le corporate et l'éditorial. Si vous hésitez, on en parle : je vous oriente selon l'usage final des images." },
      { q: "Puis-je utiliser les photos pour mon activité ?", a: "Oui. Pour un usage purement personnel, les droits privés sont inclus dans toutes les formules. Pour un usage professionnel ou commercial — site, réseaux, presse, supports imprimés, personal branding, portraits d'équipe — la formule Corporate inclut les droits d'usage commercial et s'établit sur devis selon vos besoins. Dites-moi simplement l'usage prévu, je vous prépare une proposition adaptée." },
      { q: "Combien de tenues puis-je prévoir ?", a: "Une à deux selon la durée. Je vous conseille en amont sur les couleurs et les matières qui rendent le mieux en photo, et qui s'accordent avec le décor." },
      { q: "Je ne suis pas à l'aise devant l'objectif, est-ce un problème ?", a: "C'est le cas de la grande majorité des gens — et c'est précisément mon métier. Je guide pas à pas, sans jamais vous laisser chercher quoi faire. La plupart repartent en se disant que c'était bien plus simple que prévu." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Environ deux semaines, avec une livraison express possible en option si vous en avez besoin plus vite." },
    ],
  },

  /* ============== MATERNITÉ & GROSSESSE ============== */
  maternite: {
    slug: "maternite", title: "Maternité & Grossesse", crumb: "Maternité & Grossesse", heroDefault: "bas",
    heroImg: "Photo hero — silhouette de grossesse, lumière douce",
    heroHint: "Photographe grossesse & maternité en Suisse romande — la douceur de l'attente.",
    intro: {
      lead: "Quelques semaines à peine, et tout change. La grossesse est un moment fragile et magnifique qui mérite d'être célébré, sans précipitation.",
      paragraphs: [
        "La séance se déroule à votre rythme, dans une ambiance calme. En studio chauffé près de chez vous ou en lumière naturelle, je crée des images douces et épurées qui mettent en valeur cette parenthèse — votre silhouette, vos mains, ce lien déjà là. Drapés, tissus fluides et accessoires sont fournis ; vous pouvez aussi venir avec vos propres tenues.",
        "Seule, en couple ou avec vos aînés, la séance s'adapte à votre intimité et à votre confort. Rien n'est imposé : on avance selon ce qui vous met à l'aise.",
        "Si vous le souhaitez, on prolonge l'histoire avec une séance nouveau-né dans les premiers jours du bébé, pour une galerie qui relie l'attente et l'arrivée.",
      ],
      quote: "« Porter la vie est la plus belle des lumières. »",
    },
    gallery: [
      { ph: "Silhouette en contre-jour", o: "v" },
      { ph: "Détail des mains sur le ventre", o: "h" },
      { ph: "Portrait serein", o: "v" },
      { ph: "En couple", o: "v" },
      { ph: "Drapé / tissu fluide", o: "v" },
      { ph: "Lumière de studio", o: "v" },
      { ph: "Avec l'aîné(e)", o: "v" },
      { ph: "Profil — clair-obscur", o: "v" },
      { ph: "Détail intime", o: "h" },
      { ph: "Plein cadre", o: "v" },
    ],
    formules: [
      { tag: "Studio · 1 h", name: "Lumière", price: "CHF 380",
        items: ["Séance 1 h en studio", "1 à 2 tenues / drapés fournis", "Galerie privée en ligne", "20 photos retouchées"] },
      { tag: "Le plus choisi · 1 h 30", name: "Cocon", price: "CHF 590", feature: true,
        items: ["Séance 1 h 30", "Studio ou extérieur", "En couple ou avec les aînés", "40 photos retouchées", "Tirage A5 offert"] },
      { tag: "Histoire complète", name: "Continuité", price: "CHF 980",
        items: ["Séance grossesse", "Séance nouveau-né (10 premiers jours)", "Galerie commune", "60 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur vos envies, le terme prévu et le moment idéal — généralement entre la 30e et la 36e semaine." },
      { n: "02", title: "Préparation", text: "Conseils tenues, drapés et déroulé pour que vous arriviez sereine et confiante." },
      { n: "03", title: "La séance", text: "Un temps doux, sans précipitation, à votre rythme et dans une atmosphère apaisée." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager." },
    ],
    inclus: [
      "Conseils tenues & préparation", "Studio chauffé et équipé", "Drapés et accessoires fournis",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Une bulle de douceur. Je ne me trouvais jamais photogénique enceinte — Kevin m'a fait changer d'avis.", who: "Marie, Vevey" },
      { quote: "Des images d'une finesse incroyable, qui resteront dans la famille pour toujours.", who: "Élodie & Nicolas, Neuchâtel" },
    ],
    faq: [
      { q: "À quel moment de la grossesse réserver ?", a: "Idéalement entre la 30e et la 36e semaine : le ventre est joliment arrondi et vous êtes encore tout à fait à l'aise pour bouger. Pour un terme estival, pensez à réserver dès le 2e trimestre." },
      { q: "Où a lieu la séance en Suisse romande ?", a: "En studio chauffé (adresse communiquée à la réservation) ou en extérieur — bord du Léman, forêt, lieu qui vous est cher — dans le canton de Vaud, à Genève, Fribourg, Neuchâtel ou le Valais romand." },
      { q: "Faut-il prévoir des tenues ?", a: "Je vous guide en amont. Le studio met à disposition drapés, voiles et accessoires, et vous pouvez apporter des tenues près du corps qui vous mettent à l'aise. On prévoit aussi des images en sous-vêtements ou drapé si vous le souhaitez, jamais imposées." },
      { q: "Peut-on faire la séance en couple ou en famille ?", a: "Bien sûr, et c'est très apprécié. La formule Cocon est pensée pour accueillir le ou la partenaire et les aînés." },
      { q: "Proposez-vous des séances nouveau-né ?", a: "Oui, en continuité de la grossesse avec la formule dédiée, idéalement dans les dix premiers jours du bébé, quand il dort encore beaucoup et se love facilement." },
      { q: "La séance est-elle confortable si je suis fatiguée ?", a: "Tout est pensé pour : studio chauffé, pauses libres, durée maîtrisée et aucune posture inconfortable. C'est votre moment, on prend le temps." },
    ],
  },

  /* ====================== STUDIO ====================== */
  studio: {
    slug: "studio", title: "Studio", crumb: "Studio", heroDefault: "bas",
    heroImg: "Photo hero — portrait studio, fond sobre",
    heroHint: "Portrait studio, corporate & éditorial en Suisse romande.",
    intro: {
      lead: "Un portrait fort en dit plus que mille mots. En studio, chaque détail est dirigé — lumière, posture, expression — pour révéler le meilleur de vous.",
      paragraphs: [
        "Portraits corporate, photos d'équipe, images de marque personnelle, portraits éditoriaux : le studio offre un cadre maîtrisé et reproductible. Pratique quand il faut une cohérence visuelle entre plusieurs personnes, ou des images calibrées pour un site, une page LinkedIn ou la presse.",
        "Je dirige la séance pas à pas, j'ajuste la lumière sur chaque visage et je vous montre les images au fur et à mesure pour valider ensemble. Choix des fonds (clair, sombre, coloré), une ou plusieurs tenues, et un rendu net, élégant et intemporel.",
        "Pour les entreprises, je me déplace avec un studio mobile dans vos locaux à Lausanne, Genève ou ailleurs en Suisse romande, afin de photographier toute l'équipe sur place, sans perte de temps.",
      ],
      quote: "« La lumière sculpte, le regard révèle. »",
    },
    gallery: [
      { ph: "Portrait éditorial — clair", o: "v" },
      { ph: "Portrait corporate", o: "v" },
      { ph: "Clair-obscur", o: "v" },
      { ph: "Plan rapproché", o: "h" },
      { ph: "Attitude / posture", o: "v" },
      { ph: "Fond coloré", o: "v" },
      { ph: "Noir & blanc", o: "v" },
      { ph: "Détail / mains", o: "h" },
      { ph: "Portrait de profil", o: "v" },
      { ph: "Plein pied", o: "v" },
    ],
    formules: [
      { tag: "Express · 30 min", name: "Portrait", price: "CHF 220",
        items: ["Séance 30 min", "1 fond, 1 tenue", "Galerie privée", "5 photos retouchées", "Format web + impression"] },
      { tag: "Le plus choisi · 1 h", name: "Éditorial", price: "CHF 420", feature: true,
        items: ["Séance 1 h", "2 fonds, 2 tenues", "Direction artistique", "15 photos retouchées", "Droits web inclus"] },
      { tag: "Équipes & marques", name: "Corporate", price: "dès CHF 1'400",
        items: ["Demi-journée, studio mobile sur site", "Jusqu'à 12 personnes", "Charte visuelle cohérente", "Retouche uniforme", "Livraison express"] },
    ],
    process: [
      { n: "01", title: "Brief", text: "On définit l'usage des images, le style recherché et l'ambiance visuelle — du portrait single au shooting d'équipe." },
      { n: "02", title: "Préparation", text: "Conseils tenues, fonds et lumière, pour un résultat aligné avec votre image ou votre charte." },
      { n: "03", title: "Séance", text: "Direction précise et bienveillante : je vous guide pose après pose et vous montre les images en direct." },
      { n: "04", title: "Sélection & retouche", text: "Tri ensemble, puis retouche soignée et livraison aux formats utiles (web, print, réseaux)." },
    ],
    inclus: [
      "Studio professionnel équipé", "Direction de pose", "Choix des fonds et lumières",
      "Toutes les photos livrées retouchées", "Formats web et impression", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Mes nouveaux portraits corporate ont transformé l'image de mon entreprise. Net, élégant, professionnel.", who: "Antoine, CEO · Genève" },
      { quote: "Kevin met instantanément à l'aise. Je déteste être photographiée — là, j'ai adoré le résultat.", who: "Valérie, Morges" },
    ],
    faq: [
      { q: "Où se trouve le studio ?", a: "En Suisse romande ; l'adresse exacte et l'accès vous sont communiqués à la réservation. Pour les séances d'équipe, je me déplace avec un studio mobile dans vos locaux, à Lausanne, Genève, Fribourg, Neuchâtel ou ailleurs dans la région." },
      { q: "À quoi servent ces portraits ?", a: "Photo de profil LinkedIn, page « équipe » d'un site, dossier de presse, couverture de magazine, image d'auteur ou de conférencier… Dites-moi l'usage final : je calibre le cadrage, le format et le fond en conséquence." },
      { q: "Puis-je venir avec plusieurs tenues ?", a: "Oui. Le nombre dépend de la formule. Je vous conseille sur les associations et les couleurs qui rendent le mieux selon le fond choisi." },
      { q: "Comment se passe une séance corporate pour une équipe ?", a: "J'installe un studio mobile dans une salle de vos locaux. Chaque collaborateur passe 5 à 10 minutes ; je garde la même lumière et le même cadrage pour une galerie parfaitement homogène. Idéal pour une charte visuelle d'entreprise cohérente." },
      { q: "Faites-vous des photos de produits ou de l'événementiel ?", a: "Mon cœur de métier reste le portrait et l'humain. Pour du produit ou de l'événementiel d'entreprise, contactez-moi : selon le projet, je le prends en charge ou vous oriente vers un confrère de confiance." },
      { q: "Sous quel délai les images sont-elles livrées ?", a: "Une à deux semaines selon la formule, avec une livraison express possible en option pour les besoins urgents." },
    ],
  },

  /* ====================== COUPLE ====================== */
  couple: {
    slug: "couple", title: "Couple", crumb: "Couple", heroDefault: "bas",
    heroImg: "Photo hero — couple complice en extérieur",
    heroHint: "Photographe couple & fiançailles en Suisse romande.",
    intro: {
      lead: "Pas besoin d'une grande occasion pour immortaliser un amour. Une séance couple, c'est du temps offert à votre complicité.",
      paragraphs: [
        "En extérieur ou en atelier, je crée un espace léger où vous pouvez être vous-mêmes. Plutôt que des poses figées, je vous propose des situations — marcher, se chuchoter quelque chose, se taquiner — et je saisis ce qui naît entre deux. Les plus belles images viennent presque toujours d'un rire partagé.",
        "Fiançailles, anniversaire de rencontre, future demande, ou simplement l'envie de garder une trace de cette saison de votre vie : la séance s'adapte à votre histoire et au décor qui vous ressemble — un coucher de soleil sur le Léman, un sentier en forêt, les vignes de Lavaux ou un appartement cosy un dimanche matin.",
        "Vous repartez avec une galerie privée et des fichiers haute définition, parfaits pour un faire-part, un tirage ou simplement pour vous.",
      ],
      quote: "« S'aimer, c'est regarder ensemble dans la même direction. »",
    },
    gallery: [
      { ph: "Marche complice", o: "v" },
      { ph: "Regard partagé", o: "v" },
      { ph: "Étreinte — golden hour", o: "v" },
      { ph: "Détails des mains", o: "v" },
      { ph: "Rire spontané", o: "v" },
      { ph: "Silhouette au coucher du soleil", o: "h" },
      { ph: "En mouvement", o: "v" },
      { ph: "Plan rapproché", o: "v" },
      { ph: "Paysage & couple", o: "h" },
      { ph: "Tendresse", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 45 min", name: "Escapade", price: "CHF 320",
        items: ["Séance 45 min", "1 lieu extérieur", "Galerie privée", "20 photos retouchées"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 520", feature: true,
        items: ["Séance 1 h 30", "2 lieux ou 2 tenues", "Repérage conseillé", "40 photos retouchées", "Tirage A5 offert"] },
      { tag: "Fiançailles · 2 h", name: "Promesse", price: "CHF 850",
        items: ["Séance 2 h", "Extérieur + atelier", "Mini-film souvenir 30 s", "60 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On parle de vous, de votre histoire et de l'ambiance qui vous ressemble." },
      { n: "02", title: "Lieu & tenues", text: "On choisit ensemble un cadre et des tenues à votre image, et on cale l'heure idéale pour la lumière." },
      { n: "03", title: "La séance", text: "Décontractée et joueuse : je vous propose des situations, vous vivez l'instant, je capte le reste." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à partager." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils lieu & tenues", "Direction décontractée",
      "Toutes les photos livrées retouchées", "Galerie privée en ligne", "Droits d'usage privé",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "On riait tellement qu'on a oublié l'appareil. Les photos sont à notre image : vivantes et vraies.", who: "Inès & Karim, Montreux" },
      { quote: "Le cadeau de fiançailles parfait. On a hâte de retravailler avec Kevin pour le mariage.", who: "Laura & Maxime, Sion" },
    ],
    faq: [
      { q: "Où se déroule la séance ?", a: "Au lieu de votre choix en Suisse romande — rives du Léman, vignobles de Lavaux, vieille ville, forêt ou votre intérieur — ou dans un cadre que je vous propose. Je me déplace dans le canton de Vaud, à Genève, Fribourg, Neuchâtel, en Valais romand et alentours." },
      { q: "Quel est le meilleur moment de la journée ?", a: "L'heure dorée, juste avant le coucher du soleil : la lumière y est chaude et flatteuse. On peut aussi profiter d'une lumière matinale, plus calme et plus fraîche, selon le lieu." },
      { q: "Et s'il pleut le jour J ?", a: "On reporte sans frais à une date proche, ou on bascule en atelier pour une séance plus intimiste. La météo romande étant ce qu'elle est, on garde toujours une porte de sortie." },
      { q: "Combien de temps dure une séance ?", a: "De 45 minutes à 2 heures selon la formule — le temps de se détendre, d'oublier l'objectif et de profiter l'un de l'autre." },
      { q: "Peut-on l'offrir en cadeau ?", a: "Oui, je propose des bons cadeaux personnalisés, valables un an. Une belle idée pour une demande, un anniversaire ou les fêtes." },
      { q: "On veut s'en servir pour notre faire-part de mariage, c'est possible ?", a: "Bien sûr. Beaucoup de couples font leur séance couple ou fiançailles quelques mois avant le mariage, pour le faire-part et le site. C'est aussi un excellent moyen de se familiariser avec ma façon de travailler avant le jour J." },
    ],
  },

  /* ====================== FAMILLE ====================== */
  famille: {
    slug: "famille", title: "Famille", crumb: "Famille", heroDefault: "bas",
    heroImg: "Photo hero — famille complice en extérieur, lumière dorée",
    heroHint: "Photographe de famille en Suisse romande — des images vraies, sans poses figées.",
    intro: {
      lead: "Les enfants grandissent vite, et les vraies images de famille — celles où tout le monde rit pour de bon — sont les plus précieuses. Mon rôle : capter votre tribu telle qu'elle est, complice et vivante.",
      paragraphs: [
        "Oubliez le « tout le monde regarde l'objectif et sourit ». Je crée une parenthèse de jeu et de complicité — on marche, on se chamaille, on se câline — et je saisis les regards, les fous rires et les gestes tendres entre deux. Les enfants restent eux-mêmes, et les images vous ressemblent vraiment.",
        "En extérieur et en lumière naturelle — au bord du Léman, en forêt, dans les vignes de Lavaux — ou chez vous, dans votre cocon, pour des images intimes du quotidien. La séance s'adapte à l'âge des enfants et à votre rythme : on prend le temps qu'il faut, sans pression.",
        "Séance famille classique, arrivée d'un nouveau-né, séance multigénérationnelle avec les grands-parents, ou rendez-vous annuel pour suivre la tribu qui grandit : on construit la séance autour de votre histoire.",
      ],
      quote: "« Une famille, c'est une histoire qu'on n'a jamais fini de photographier. »",
    },
    gallery: [
      { ph: "Famille complice en extérieur", o: "h" },
      { ph: "Fou rire d'enfant", o: "v" },
      { ph: "Câlin parent-enfant", o: "v" },
      { ph: "Course dans l'herbe", o: "h" },
      { ph: "Détail — petites mains", o: "v" },
      { ph: "Portrait de fratrie", o: "v" },
      { ph: "Tendresse à contre-jour", o: "v" },
      { ph: "Trois générations réunies", o: "v" },
      { ph: "Jeu à l'heure dorée", o: "v" },
      { ph: "Instant du quotidien", o: "v" },
    ],
    formules: [
      { tag: "Découverte · 1 h", name: "Tribu", price: "CHF 390",
        items: ["Séance 1 h en extérieur", "1 lieu en Suisse romande", "Galerie privée en ligne", "20 photos retouchées", "Fichiers web + impression"] },
      { tag: "Le plus choisi · 1 h 30", name: "Complices", price: "CHF 590", feature: true,
        items: ["Séance 1 h 30", "Extérieur ou à domicile", "Jusqu'à 6 personnes", "35 photos retouchées", "Tirage A4 offert"] },
      { tag: "Multigénération · 2 h", name: "Tribu élargie", price: "CHF 890",
        items: ["Séance 2 h", "Jusqu'à 12 personnes (grands-parents inclus)", "2 lieux ou 2 ambiances", "50 photos retouchées", "Album fine art 20×20"] },
    ],
    process: [
      { n: "01", title: "Prise de contact", text: "On échange sur votre famille, l'âge des enfants, l'ambiance et le lieu qui vous ressemblent." },
      { n: "02", title: "Préparation", text: "Conseils tenues et couleurs accordées, choix du lieu et de l'horaire idéal selon l'âge des plus petits." },
      { n: "03", title: "La séance", text: "Du jeu, pas de poses figées. Je guide en douceur, au rythme des enfants — et on s'amuse pour de vrai." },
      { n: "04", title: "Livraison", text: "Votre galerie privée sous 2 semaines, prête à imprimer et à partager avec toute la famille." },
    ],
    inclus: [
      "Échange préparatoire", "Conseils tenues & couleurs accordées", "Séance en extérieur ou à domicile",
      "Direction bienveillante, au rythme des enfants", "Toutes les photos livrées retouchées", "Galerie privée en ligne",
      "Frais de déplacement inclus jusqu'à 30 km autour de Mézières (VD)",
    ],
    testimonials: [
      { quote: "Les premières photos de famille où nos enfants sont vraiment eux-mêmes. On rit à chaque fois qu'on les regarde.", who: "Famille Rochat, Lausanne" },
      { quote: "Kevin a réuni trois générations avec une facilité déconcertante. Un souvenir inestimable pour nous tous.", who: "Famille Pereira, Fribourg" },
    ],
    faq: [
      { q: "À partir de quel âge photographier les enfants ?", a: "À tout âge — du nouveau-né aux adolescents. Pour les bébés, on privilégie les dix premiers jours ou la période après 6 mois (quand ils tiennent assis). Pour les plus grands, la séance se transforme en jeu : c'est souvent là que naissent les plus belles images." },
      { q: "Où se déroule la séance photo de famille ?", a: "Au lieu de votre choix — bord du Léman, forêt, vignes de Lavaux, parc — ou à votre domicile pour des images intimes du quotidien. Le déplacement est offert dans un rayon de 30 km autour de Mézières (VD). Au-delà, un supplément est prévu selon l'endroit." },
      { q: "Comment ça se passe avec des enfants en bas âge ou agités ?", a: "C'est tout l'intérêt du reportage : je ne cherche pas à les figer. On joue, on bouge, on fait des pauses goûter si besoin. Je m'adapte à leur rythme et à leur humeur — les enfants qui « ne tiennent pas en place » donnent souvent les photos les plus vivantes." },
      { q: "Peut-on faire une séance avec les grands-parents ?", a: "Oui, et c'est très demandé. La formule Tribu élargie est pensée pour les séances multigénérationnelles, jusqu'à douze personnes — un magnifique cadeau pour réunir toute la famille autour d'images qui restent." },
      { q: "Que porter pour une séance photo de famille ?", a: "Des tenues coordonnées, sans être assorties à l'identique : une palette de 2 ou 3 couleurs douces et naturelles fonctionne très bien. Évitez les gros logos et les motifs chargés. Je vous envoie des conseils personnalisés avant la séance." },
      { q: "Sous quel délai les photos sont-elles livrées ?", a: "Environ deux semaines, dans une galerie privée en ligne, en haute définition pour l'impression comme pour le partage. Une livraison express est possible en option." },
    ],
  },
};
