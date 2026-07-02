export type EmailTemplateCategory = "adopter_journey" | "post_adoption";

export type DefaultEmailTemplate = {
  templateKey: string;
  title: string;
  category: EmailTemplateCategory;
  context: string;
  subject: string;
  body: string;
};

export const defaultEmailTemplates = [
  {
    templateKey: "pre_reservation",
    title: "Pré-réservation",
    category: "adopter_journey",
    context:
      "À envoyer après confirmation de gestation, lorsque les pré-réservations sont ouvertes.",
    subject: "Ouverture des pré-réservations - [Portée]",
    body: `Bonjour [Prénom],

Je vous confirme que la gestation est bien confirmée pour [Portée]. Les pré-réservations sont donc ouvertes pour cette portée.

Si vous souhaitez maintenir votre projet, je vous propose d’effectuer un versement de pré-réservation de 250 €, remboursable sur simple demande jusqu’à signature du contrat de réservation.

Ce versement n’est pas des arrhes à ce stade. Il permet simplement de confirmer votre intérêt et de préparer la suite du parcours, sans garantir encore une réservation définitive.

Le contrat de réservation et le certificat d’engagement et de connaissance ne seront envoyés qu’après la naissance, si une proposition compatible peut vous être faite.

La réservation finale dépendra des naissances réelles, des sexes disponibles, du rang des adoptants et de la compatibilité avec votre projet. Je reste décisionnaire du passage en réservation afin de veiller au bon placement de chaque chiot ou chaton.

Je reste disponible si vous avez des questions.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "birth_documents_deposit",
    title: "Naissance : documents + complément",
    category: "adopter_journey",
    context:
      "À envoyer après la naissance, lorsqu’une place compatible peut être proposée.",
    subject: "Naissance de [Portée] - documents de réservation",
    body: `Bonjour [Prénom],

J’ai le plaisir de vous annoncer que la portée [Portée] est née le [Date de naissance].

Au regard des naissances, des sexes disponibles, du rang et de votre projet, une place compatible peut vous être proposée.

Vous trouverez avec cet email le certificat d’engagement et de connaissance ainsi que le contrat de réservation à signer. Je vous remercie de me les retourner complétés et signés selon les consignes indiquées dans les documents.

Pour consolider la réservation, un complément de 250 € est également demandé.

Les 500 € d’arrhes seront constitués seulement après :
- signature du contrat de réservation ;
- retour du certificat d’engagement signé ou validé selon le fonctionnement retenu ;
- paiement du complément de 250 €.

Merci de me retourner les documents et d’effectuer le paiement du complément dans les prochains jours, afin que je puisse confirmer sereinement la suite du dossier.

Je reste disponible si vous avez besoin d’une précision avant signature.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "choice_appointment_adoption_booklet",
    title: "Confirmation créneau de choix + livret d’adoption",
    category: "adopter_journey",
    context:
      "À envoyer après consolidation de la réservation, lorsque les arrhes sont réglées et que le créneau de choix doit être confirmé.",
    subject: "Confirmation du créneau de choix - [Portée]",
    body: `Bonjour [Prénom],

Votre réservation est désormais validée / consolidée, et les arrhes sont réglées. Nous pouvons donc préparer l’étape du choix du chiot ou chaton.

Le livret d’adoption sera joint à cet email. Je vous invite à le lire avant le rendez-vous : il reprend les informations utiles pour préparer l’arrivée de [Nom du chiot] / [Nom de l’animal] et les premiers jours à la maison.

Merci de me confirmer le créneau de choix du chiot/chaton prévu le [Date du rendez-vous de choix].

Ce créneau est important, car il dépend de l’ordre ou du rang des adoptants. Il permet d’organiser les choix de façon claire et équitable pour chaque famille.

Nous pourrons également confirmer ou ajuster le créneau de départ/adoption prévu le [Date du rendez-vous de départ], si besoin.

N’hésitez pas à me poser vos questions après lecture du livret ou avant le rendez-vous.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "departure_preparation",
    title: "Préparation du départ",
    category: "adopter_journey",
    context:
      "À envoyer avant l’adoption ou le départ, pour préparer le rendez-vous et les derniers éléments pratiques.",
    subject: "Préparation du départ de [Nom de l’animal]",
    body: `Bonjour [Prénom],

Le départ de [Nom de l’animal] est prévu le [Date de départ]. Merci de me confirmer que le jour et l’heure convenus vous conviennent toujours.

Sauf erreur de ma part, le solde restant dû est de [Montant restant dû]. Merci de prévoir son règlement selon les modalités convenues.

Lors du départ, je vous remettrai les documents et éléments prévus pour l’adoption, notamment les documents administratifs disponibles, les informations de suivi et les conseils utiles pour les premiers jours.

Pour l’accueil, pensez à prévoir :
- une solution de transport sécurisée ;
- l’alimentation adaptée pour la transition ;
- le matériel de base conseillé ;
- un espace calme pour les premiers jours.

Je vous rappellerai également les consignes pratiques concernant l’alimentation, le transport, l’installation et les premiers repères à la maison.

Si vous avez des questions de dernière minute, n’hésitez pas à me les envoyer avant le rendez-vous.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "followup_4_months",
    title: "Suivi post-adoption 4 mois",
    category: "post_adoption",
    context:
      "À envoyer environ 4 mois après l’adoption, avec une fiche ou un formulaire de suivi.",
    subject: "Quelques nouvelles de [Nom de l’animal]",
    body: `Bonjour [Prénom],

J’espère que vous allez bien et que [Nom de l’animal] poursuit sereinement son adaptation dans sa famille.

Environ 4 mois après l’adoption, je vous propose de me faire un retour via la fiche ou le formulaire de suivi prévu à cet effet.

Vos réponses me permettent de suivre son évolution sur plusieurs points :
- santé ;
- comportement ;
- adaptation ;
- alimentation ;
- croissance.

Si vous le souhaitez, vous pouvez également joindre quelques photos récentes.

Ces retours sont précieux pour le suivi d’élevage et m’aident à accompagner au mieux les familles et les futures portées.

Merci beaucoup pour votre retour.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "birthday_1_year",
    title: "Anniversaire 1 an",
    category: "post_adoption",
    context:
      "À envoyer autour du premier anniversaire de l’animal, dans un ton chaleureux et personnel.",
    subject: "Joyeux anniversaire [Nom de l’animal]",
    body: `Bonjour [Prénom],

Je souhaite un très joyeux premier anniversaire à [Nom de l’animal].

J’espère qu’il / elle va bien et que cette première année à vos côtés s’est passée dans les meilleures conditions.

Si vous avez quelques nouvelles à partager, je serai très heureuse de savoir comment il / elle évolue, côté santé, comportement et vie quotidienne.

Quelques photos sont évidemment les bienvenues si vous avez envie d’en envoyer.

Merci encore pour les nouvelles que vous pourrez me donner, c’est toujours un plaisir de suivre les chiots et chatons nés à l’élevage.

Bien cordialement,

[Nom de l’élevage]`,
  },
  {
    templateKey: "followup_15_months",
    title: "Suivi post-adoption 15 mois",
    category: "post_adoption",
    context:
      "À envoyer aux 15 mois de l’animal, pour recueillir un retour plus structuré de suivi d’élevage.",
    subject: "Suivi des 15 mois de [Nom de l’animal]",
    body: `Bonjour [Prénom],

[Nom de l’animal] approche ou vient d’atteindre ses 15 mois, et je vous propose de me transmettre un retour plus complet sur son évolution.

Votre retour peut porter sur :
- santé ;
- comportement ;
- croissance ;
- vie quotidienne ;
- alimentation ;
- activité ;
- éventuelles difficultés rencontrées ;
- remarques utiles pour le suivi d’élevage.

Ces informations sont importantes pour garder une vision sérieuse de l’évolution des animaux nés à l’élevage et améliorer l’accompagnement des familles dans la durée.

Vous pouvez compléter la fiche ou le formulaire de suivi prévu, et ajouter quelques photos si vous le souhaitez.

Merci beaucoup pour le temps consacré à ce retour.

Bien cordialement,

[Nom de l’élevage]`,
  },
] satisfies DefaultEmailTemplate[];

export const defaultEmailTemplateKeys = defaultEmailTemplates.map(
  (template) => template.templateKey,
);

export function buildEmailBodyWithSubject({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  return `Objet : ${subject}\n\n${body}`;
}
