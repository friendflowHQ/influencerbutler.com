/**
 * Summary: All visitor-facing copy for the Build Week event page in en-US,
 *   es-ES and fr-FR, plus the ?lang= resolver. The site has no per-route i18n
 *   helper for standalone pages, so this follows the blog pattern: English is
 *   served at the clean URL and other locales carry ?lang=. The binding Official
 *   Rules are English only (the page says so in every language).
 *   No em or en dashes anywhere (site rule).
 * Dependencies: none.
 */

export type BuildWeekLocale = "en-US" | "es-ES" | "fr-FR";
export const BUILD_WEEK_LOCALES: readonly BuildWeekLocale[] = ["en-US", "es-ES", "fr-FR"];
export const DEFAULT_BUILD_WEEK_LOCALE: BuildWeekLocale = "en-US";

export function resolveBuildWeekLocale(value: string | undefined | null): BuildWeekLocale {
  const v = String(value ?? "").trim();
  return (BUILD_WEEK_LOCALES as readonly string[]).includes(v)
    ? (v as BuildWeekLocale)
    : DEFAULT_BUILD_WEEK_LOCALE;
}

export type MilestoneLabels = {
  ideasOpen: string;
  ideasClose: string;
  votingClose: string;
  buildStart: string;
  buildDeadline: string;
};

export type BuildWeekCopy = {
  htmlLang: string;
  ogLocale: string;
  languageName: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1Lead: string;
  h1Accent: string;
  heroBody: string;
  ctaPrimary: string;
  ctaSecondary: string;
  heroNote: string;
  countdown: {
    aria: string;
    done: string;
    units: { days: string; hours: string; minutes: string; seconds: string };
    labels: MilestoneLabels;
  };
  promise: { title: string; body: string; fine: string };
  steps: { title: string; items: { title: string; body: string }[] };
  timeline: { title: string; rows: { when: string; what: string }[] };
  ideas: {
    title: string;
    intro: string;
    goodTitle: string;
    good: string[];
    notTitle: string;
    not: string[];
    originTitle: string;
    origin: string;
  };
  form: {
    title: string;
    intro: string;
    name: string;
    email: string;
    groupName: string;
    ideaUrl: string;
    ideaUrlHelp: string;
    ideaSummary: string;
    agreeStart: string;
    agreeRules: string;
    agreeMiddle: string;
    agreePrivacy: string;
    agreeEnd: string;
    updates: string;
    submit: string;
    sending: string;
    successTitle: string;
    successBody: string;
    verify: string;
    errorGeneric: string;
    errorNetwork: string;
  };
  share: { title: string; text: string; shareTitle: string; on: string; email: string; copyLink: string; copied: string };
  price: string;
  trial: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  rulesNote: string;
  languageLabel: string;
};

const EN: BuildWeekCopy = {
  htmlLang: "en",
  ogLocale: "en_US",
  languageName: "English",
  metaTitle: "Build Week: pitch a Butler, built in a week or you get lifetime access",
  metaDescription:
    "Pitch an idea for a new Influencer Butler tool. Ten ideas get built November 2 to 8. If we can't build yours to a working standard, you and a friend get lifetime Pro access.",
  eyebrow: "Build Week: Nov 2 to 8",
  h1Lead: "Pitch a Butler.",
  h1Accent: "We build it in a week, or you get lifetime access.",
  heroBody:
    "Ten ideas from our Facebook group get built during Build Week. If we can't build yours to a working standard, you and a friend get Influencer Butler Pro for life.",
  ctaPrimary: "Join the group and pitch your idea",
  ctaSecondary: "Read the official rules",
  heroNote: "Free to enter. No purchase necessary. Prize open to U.S. residents 18 and older.",
  countdown: {
    aria: "Time until the next Build Week milestone",
    done: "Build Week has ended. Thank you to everyone who pitched!",
    units: { days: "Days", hours: "Hours", minutes: "Min", seconds: "Sec" },
    labels: {
      ideasOpen: "Ideas open in",
      ideasClose: "Idea submissions close in",
      votingClose: "Voting closes in",
      buildStart: "Build Week starts in",
      buildDeadline: "Build Week ends in",
    },
  },
  promise: {
    title: "The guarantee",
    body: "If we can't build your Featured Idea to a working standard by Sunday, November 8, you get a lifetime Influencer Butler Pro Solo license, and so does a friend you choose.",
    fine: "Lifetime means for as long as the Pro Solo plan is offered by us or our successor. Each license is for one device, can't be sold or transferred, and has no cash value. Full details are in the Official Rules.",
  },
  steps: {
    title: "How it works",
    items: [
      { title: "Join the Facebook group", body: "It's free, and the group is where every idea and every vote lives." },
      { title: "Post your idea", body: "Use the template in the pinned post: what it does, who it's for, which site or app it works with, and why it matters." },
      { title: "Get votes", body: "Group members vote with reactions. Seven of the ten spots go to the most-reacted ideas, and we pick three ourselves." },
      { title: "We build it, or you win", body: "We build all ten during Build Week and show our progress in public. Miss the mark, and the lifetime guarantee kicks in." },
    ],
  },
  timeline: {
    title: "The timeline",
    rows: [
      { when: "Oct 12 to Oct 28", what: "Pitch your idea in the Facebook group, one comment per idea." },
      { when: "Through Oct 31, 11:59 PM MT", what: "Group members vote with reactions." },
      { when: "Sun Nov 1", what: "The 10 Featured Ideas are announced: 7 by reactions, 3 staff picks." },
      { when: "Nov 2 to Nov 8", what: "Build Week. We build in public, with a live demo on Friday, Nov 6." },
      { when: "Sun Nov 8, 11:59 PM MT", what: "Build deadline. Any idea not built to the Working Standard earns the guarantee." },
    ],
  },
  ideas: {
    title: "What makes a good idea",
    intro: "Think of a job you do by hand again and again that a desktop Butler could do for you.",
    goodTitle: "Great ideas",
    good: [
      "Automate something you do every week",
      "Work with a site or app creators already use",
      "Have a clear \"done\": what should it do when it works?",
      "Can be explained in a few sentences",
    ],
    notTitle: "Ideas we can't take",
    not: [
      "Anything that breaks the law or a website's terms",
      "Ideas that need a partner or access we can't get in a week",
      "Things Influencer Butler already does",
    ],
    originTitle: "How this started",
    origin:
      "This month a member asked for a way to send her Facebook group's deals to Telegram automatically. We built it within hours. Build Week is that, ten times over.",
  },
  form: {
    title: "Already pitched? Tell us how to reach you",
    intro:
      "Post your idea in the Facebook group first. This short form is only so we can contact you if your idea is featured or if we owe you a prize.",
    name: "Your name",
    email: "Email",
    groupName: "Your name as it appears in the group (optional)",
    ideaUrl: "Link to your idea comment",
    ideaUrlHelp: "Open your comment in the group, click its time stamp, and paste the link here.",
    ideaSummary: "Or describe your idea in a few sentences (optional)",
    agreeStart: "I have read and agree to the ",
    agreeRules: "Official Rules",
    agreeMiddle: " and the ",
    agreePrivacy: "Privacy Policy",
    agreeEnd: ", and I am 18 or older.",
    updates: "Email me Build Week updates (you can unsubscribe any time)",
    submit: "Send my entry",
    sending: "Sending...",
    successTitle: "You're in!",
    successBody:
      "Thanks. We'll email you if your idea is featured. Make sure your idea is posted in the group so people can vote for it.",
    verify: "Please complete the check above.",
    errorGeneric: "Something went wrong. Please try again.",
    errorNetwork: "Network error. Please try again.",
  },
  share: {
    title: "Know someone with a great idea?",
    text: "Pitch a Butler. We build it in a week, or you get lifetime access: Influencer Butler Build Week.",
    shareTitle: "Influencer Butler Build Week",
    on: "Share on",
    email: "Email",
    copyLink: "Copy link",
    copied: "Copied!",
  },
  price: "Pricing note: Influencer Butler Pro prices go up at the end of November. Start your free trial now and you start at today's price.",
  trial: "Try Influencer Butler free for 14 days",
  faqTitle: "Questions",
  faq: [
    {
      q: "Do I have to buy anything to take part?",
      a: "No. It's free to pitch, free to vote, and no purchase is necessary to be eligible for the guarantee prize. You don't need to be an Influencer Butler customer.",
    },
    {
      q: "How are the 10 ideas chosen?",
      a: "Seven go to the most-reacted ideas, counted from group members when voting closes on October 31 at 11:59 PM Mountain Time. We choose the other three ourselves, so great ideas from smaller accounts get a chance too.",
    },
    {
      q: "What does \"built to a working standard\" mean?",
      a: "It's in a released version of the app that you can use, it does the main job you described when we test it on the real site, it doesn't crash or lose data, and it has a help page. Small cosmetic issues don't count against it.",
    },
    {
      q: "What do I get if you can't build my idea?",
      a: "A lifetime Influencer Butler Pro Solo license for you and one for a friend you name. If we do build it, you get the new Butler and public credit for the idea.",
    },
    {
      q: "What does \"lifetime\" mean?",
      a: "For as long as the Pro Solo plan is offered by us or by whoever owns Influencer Butler in the future. It's for one device, can't be sold, transferred or swapped for money, and can be ended for misuse. See the Official Rules for the details.",
    },
    {
      q: "What happens to my idea?",
      a: "Ideas are posted publicly in the group. By pitching, you let us build on them, and we own what we build. You get credit, and the guarantee if we miss the mark.",
    },
    {
      q: "Who can win the prize?",
      a: "Anyone can pitch and vote. To receive a guarantee prize you must be a U.S. resident, 18 or older, and a member of the group.",
    },
    {
      q: "Is Facebook involved?",
      a: "No. Build Week isn't sponsored, endorsed or run by Facebook or Meta. It's run by The Social Media Posse LLC.",
    },
  ],
  rulesNote: "The Official Rules are in English, and the English version controls. This page is shown in other languages for convenience.",
  languageLabel: "Language",
};

const ES: BuildWeekCopy = {
  htmlLang: "es",
  ogLocale: "es_ES",
  languageName: "Español",
  metaTitle: "Build Week: propón un Butler, lo construimos en una semana o tienes acceso de por vida",
  metaDescription:
    "Propón una idea para una nueva herramienta de Influencer Butler. Diez ideas se construyen del 2 al 8 de noviembre. Si no podemos construir la tuya con un estándar de funcionamiento, tú y un amigo reciben acceso Pro de por vida.",
  eyebrow: "Build Week: del 2 al 8 de nov",
  h1Lead: "Propón un Butler.",
  h1Accent: "Lo construimos en una semana, o tienes acceso de por vida.",
  heroBody:
    "Diez ideas de nuestro grupo de Facebook se construyen durante Build Week. Si no podemos construir la tuya con un estándar de funcionamiento, tú y un amigo reciben Influencer Butler Pro de por vida.",
  ctaPrimary: "Únete al grupo y propón tu idea",
  ctaSecondary: "Lee las reglas oficiales",
  heroNote: "Participar es gratis. No es necesaria ninguna compra. El premio es para residentes de EE. UU. mayores de 18 años.",
  countdown: {
    aria: "Tiempo hasta el próximo hito de Build Week",
    done: "Build Week ha terminado. ¡Gracias a todos los que propusieron ideas!",
    units: { days: "Días", hours: "Horas", minutes: "Min", seconds: "Seg" },
    labels: {
      ideasOpen: "Las ideas se abren en",
      ideasClose: "Las propuestas se cierran en",
      votingClose: "La votación se cierra en",
      buildStart: "Build Week empieza en",
      buildDeadline: "Build Week termina en",
    },
  },
  promise: {
    title: "La garantía",
    body: "Si no podemos construir tu Idea Destacada con un estándar de funcionamiento antes del domingo 8 de noviembre, recibes una licencia de por vida de Influencer Butler Pro Solo, y un amigo que elijas también.",
    fine: "De por vida significa mientras nosotros o nuestro sucesor ofrezcamos el plan Pro Solo. Cada licencia es para un dispositivo, no se puede vender ni transferir y no tiene valor en efectivo. Los detalles completos están en las Reglas Oficiales.",
  },
  steps: {
    title: "Cómo funciona",
    items: [
      { title: "Únete al grupo de Facebook", body: "Es gratis, y el grupo es donde viven todas las ideas y todos los votos." },
      { title: "Publica tu idea", body: "Usa la plantilla de la publicación fijada: qué hace, para quién es, con qué sitio o app funciona y por qué importa." },
      { title: "Consigue votos", body: "Los miembros del grupo votan con reacciones. Siete de los diez puestos son para las ideas con más reacciones, y nosotros elegimos tres." },
      { title: "La construimos, o ganas tú", body: "Construimos las diez durante Build Week y mostramos el progreso en público. Si no llegamos, se activa la garantía de por vida." },
    ],
  },
  timeline: {
    title: "El calendario",
    rows: [
      { when: "12 al 28 de oct", what: "Publica tu idea en el grupo de Facebook, un comentario por idea." },
      { when: "Hasta el 31 de oct, 11:59 PM MT", what: "Los miembros del grupo votan con reacciones." },
      { when: "Dom 1 de nov", what: "Se anuncian las 10 Ideas Destacadas: 7 por reacciones, 3 elegidas por nosotros." },
      { when: "2 al 8 de nov", what: "Build Week. Construimos en público, con una demo en vivo el viernes 6 de nov." },
      { when: "Dom 8 de nov, 11:59 PM MT", what: "Fecha límite. Toda idea que no cumpla el Estándar de Funcionamiento activa la garantía." },
    ],
  },
  ideas: {
    title: "Qué hace buena a una idea",
    intro: "Piensa en una tarea que haces a mano una y otra vez y que un Butler de escritorio podría hacer por ti.",
    goodTitle: "Grandes ideas",
    good: [
      "Automatizan algo que haces cada semana",
      "Funcionan con un sitio o app que los creadores ya usan",
      "Tienen un \"listo\" claro: ¿qué debe hacer cuando funciona?",
      "Se pueden explicar en pocas frases",
    ],
    notTitle: "Ideas que no podemos aceptar",
    not: [
      "Cualquier cosa que infrinja la ley o los términos de un sitio web",
      "Ideas que necesitan un socio o un acceso que no podemos conseguir en una semana",
      "Cosas que Influencer Butler ya hace",
    ],
    originTitle: "Cómo empezó todo",
    origin:
      "Este mes una miembro pidió una forma de enviar automáticamente a Telegram las ofertas de su grupo de Facebook. La construimos en cuestión de horas. Build Week es eso, multiplicado por diez.",
  },
  form: {
    title: "¿Ya propusiste tu idea? Dinos cómo contactarte",
    intro:
      "Publica primero tu idea en el grupo de Facebook. Este breve formulario solo sirve para contactarte si tu idea es destacada o si te debemos un premio.",
    name: "Tu nombre",
    email: "Correo electrónico",
    groupName: "Tu nombre tal como aparece en el grupo (opcional)",
    ideaUrl: "Enlace a tu comentario con la idea",
    ideaUrlHelp: "Abre tu comentario en el grupo, haz clic en su fecha y pega aquí el enlace.",
    ideaSummary: "O describe tu idea en pocas frases (opcional)",
    agreeStart: "He leído y acepto las ",
    agreeRules: "Reglas Oficiales",
    agreeMiddle: " y la ",
    agreePrivacy: "Política de Privacidad",
    agreeEnd: ", y tengo 18 años o más.",
    updates: "Quiero recibir novedades de Build Week por correo (puedes darte de baja cuando quieras)",
    submit: "Enviar mi participación",
    sending: "Enviando...",
    successTitle: "¡Ya estás dentro!",
    successBody:
      "Gracias. Te escribiremos si tu idea es destacada. Asegúrate de que tu idea esté publicada en el grupo para que la gente pueda votarla.",
    verify: "Completa la verificación de arriba.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorNetwork: "Error de red. Inténtalo de nuevo.",
  },
  share: {
    title: "¿Conoces a alguien con una gran idea?",
    text: "Propón un Butler. Lo construimos en una semana, o tienes acceso de por vida: Influencer Butler Build Week.",
    shareTitle: "Influencer Butler Build Week",
    on: "Compartir en",
    email: "Correo",
    copyLink: "Copiar enlace",
    copied: "¡Copiado!",
  },
  price: "Nota sobre precios: los precios de Influencer Butler Pro suben a finales de noviembre. Empieza ahora tu prueba gratuita y empiezas al precio de hoy.",
  trial: "Prueba Influencer Butler gratis durante 14 días",
  faqTitle: "Preguntas",
  faq: [
    {
      q: "¿Tengo que comprar algo para participar?",
      a: "No. Proponer ideas y votar es gratis, y no es necesaria ninguna compra para ser elegible al premio de la garantía. No hace falta ser cliente de Influencer Butler.",
    },
    {
      q: "¿Cómo se eligen las 10 ideas?",
      a: "Siete son para las ideas con más reacciones, contadas entre los miembros del grupo cuando se cierre la votación el 31 de octubre a las 11:59 PM, hora de las Montañas. Las otras tres las elegimos nosotros, para que también tengan opciones las grandes ideas de cuentas más pequeñas.",
    },
    {
      q: "¿Qué significa \"construida con un estándar de funcionamiento\"?",
      a: "Está en una versión publicada de la app que puedes usar, hace la tarea principal que describiste cuando la probamos en el sitio real, no se cierra ni pierde datos, y tiene una página de ayuda. Los problemas estéticos menores no cuentan en contra.",
    },
    {
      q: "¿Qué recibo si no pueden construir mi idea?",
      a: "Una licencia de por vida de Influencer Butler Pro Solo para ti y otra para un amigo que nombres. Si la construimos, recibes el nuevo Butler y reconocimiento público por la idea.",
    },
    {
      q: "¿Qué significa \"de por vida\"?",
      a: "Mientras nosotros, o quien sea dueño de Influencer Butler en el futuro, ofrezcamos el plan Pro Solo. Es para un dispositivo, no se puede vender, transferir ni cambiar por dinero, y puede terminar por mal uso. Consulta las Reglas Oficiales para los detalles.",
    },
    {
      q: "¿Qué pasa con mi idea?",
      a: "Las ideas se publican en el grupo, a la vista de todos. Al proponerla, nos permites construir sobre ella, y lo que construimos es nuestro. Recibes reconocimiento, y la garantía si no llegamos.",
    },
    {
      q: "¿Quién puede ganar el premio?",
      a: "Cualquiera puede proponer y votar. Para recibir un premio de la garantía debes residir en EE. UU., tener 18 años o más y ser miembro del grupo.",
    },
    {
      q: "¿Interviene Facebook?",
      a: "No. Build Week no está patrocinado, respaldado ni gestionado por Facebook ni Meta. Lo organiza The Social Media Posse LLC.",
    },
  ],
  rulesNote: "Las Reglas Oficiales están en inglés y prevalece la versión en inglés. Esta página se muestra en otros idiomas por comodidad.",
  languageLabel: "Idioma",
};

const FR: BuildWeekCopy = {
  htmlLang: "fr",
  ogLocale: "fr_FR",
  languageName: "Français",
  metaTitle: "Build Week : proposez un Butler, construit en une semaine ou accès à vie",
  metaDescription:
    "Proposez une idée pour un nouvel outil Influencer Butler. Dix idées sont construites du 2 au 8 novembre. Si nous ne pouvons pas construire la vôtre selon une norme de fonctionnement, vous et un ami obtenez l'accès Pro à vie.",
  eyebrow: "Build Week : du 2 au 8 nov.",
  h1Lead: "Proposez un Butler.",
  h1Accent: "Nous le construisons en une semaine, sinon vous avez un accès à vie.",
  heroBody:
    "Dix idées de notre groupe Facebook sont construites pendant Build Week. Si nous ne pouvons pas construire la vôtre selon une norme de fonctionnement, vous et un ami obtenez Influencer Butler Pro à vie.",
  ctaPrimary: "Rejoignez le groupe et proposez votre idée",
  ctaSecondary: "Lire le règlement officiel",
  heroNote: "Participation gratuite. Aucun achat requis. Le prix est réservé aux résidents des États-Unis âgés de 18 ans ou plus.",
  countdown: {
    aria: "Temps avant la prochaine étape de Build Week",
    done: "Build Week est terminée. Merci à toutes les personnes qui ont proposé une idée !",
    units: { days: "Jours", hours: "Heures", minutes: "Min", seconds: "Sec" },
    labels: {
      ideasOpen: "Ouverture des idées dans",
      ideasClose: "Clôture des propositions dans",
      votingClose: "Clôture du vote dans",
      buildStart: "Build Week commence dans",
      buildDeadline: "Build Week se termine dans",
    },
  },
  promise: {
    title: "La garantie",
    body: "Si nous ne pouvons pas construire votre Idée retenue selon une norme de fonctionnement d'ici le dimanche 8 novembre, vous recevez une licence à vie Influencer Butler Pro Solo, et un ami de votre choix aussi.",
    fine: "À vie signifie tant que le forfait Pro Solo est proposé par nous ou notre successeur. Chaque licence est pour un seul appareil, ne peut être ni vendue ni transférée et n'a aucune valeur en espèces. Tous les détails figurent dans le règlement officiel.",
  },
  steps: {
    title: "Comment ça marche",
    items: [
      { title: "Rejoignez le groupe Facebook", body: "C'est gratuit, et le groupe est l'endroit où se trouvent toutes les idées et tous les votes." },
      { title: "Publiez votre idée", body: "Utilisez le modèle de la publication épinglée : ce qu'elle fait, pour qui, avec quel site ou quelle appli, et pourquoi c'est important." },
      { title: "Obtenez des votes", body: "Les membres du groupe votent avec des réactions. Sept des dix places vont aux idées les plus réagies, et nous en choisissons trois." },
      { title: "Nous la construisons, ou vous gagnez", body: "Nous construisons les dix pendant Build Week et montrons l'avancement en public. Si nous échouons, la garantie à vie s'applique." },
    ],
  },
  timeline: {
    title: "Le calendrier",
    rows: [
      { when: "Du 12 au 28 oct.", what: "Publiez votre idée dans le groupe Facebook, un commentaire par idée." },
      { when: "Jusqu'au 31 oct., 23 h 59 MT", what: "Les membres du groupe votent avec des réactions." },
      { when: "Dim. 1er nov.", what: "Annonce des 10 Idées retenues : 7 par réactions, 3 choisies par nous." },
      { when: "Du 2 au 8 nov.", what: "Build Week. Nous construisons en public, avec une démo en direct le vendredi 6 nov." },
      { when: "Dim. 8 nov., 23 h 59 MT", what: "Date limite. Toute idée qui n'atteint pas la Norme de fonctionnement déclenche la garantie." },
    ],
  },
  ideas: {
    title: "Ce qui fait une bonne idée",
    intro: "Pensez à une tâche que vous faites à la main encore et encore et qu'un Butler de bureau pourrait faire à votre place.",
    goodTitle: "De bonnes idées",
    good: [
      "Automatisent quelque chose que vous faites chaque semaine",
      "Fonctionnent avec un site ou une appli que les créateurs utilisent déjà",
      "Ont une fin claire : que doit-elle faire quand elle fonctionne ?",
      "Peuvent s'expliquer en quelques phrases",
    ],
    notTitle: "Idées que nous ne pouvons pas accepter",
    not: [
      "Tout ce qui enfreint la loi ou les conditions d'un site web",
      "Les idées qui exigent un partenaire ou un accès que nous ne pouvons pas obtenir en une semaine",
      "Ce qu'Influencer Butler fait déjà",
    ],
    originTitle: "Comment tout a commencé",
    origin:
      "Ce mois-ci, une membre a demandé un moyen d'envoyer automatiquement vers Telegram les bons plans de son groupe Facebook. Nous l'avons construit en quelques heures. Build Week, c'est cela, multiplié par dix.",
  },
  form: {
    title: "Vous avez déjà proposé ? Dites-nous comment vous joindre",
    intro:
      "Publiez d'abord votre idée dans le groupe Facebook. Ce court formulaire sert uniquement à vous contacter si votre idée est retenue ou si nous vous devons un prix.",
    name: "Votre nom",
    email: "E-mail",
    groupName: "Votre nom tel qu'il apparaît dans le groupe (facultatif)",
    ideaUrl: "Lien vers votre commentaire d'idée",
    ideaUrlHelp: "Ouvrez votre commentaire dans le groupe, cliquez sur sa date et collez le lien ici.",
    ideaSummary: "Ou décrivez votre idée en quelques phrases (facultatif)",
    agreeStart: "J'ai lu et j'accepte le ",
    agreeRules: "règlement officiel",
    agreeMiddle: " et la ",
    agreePrivacy: "politique de confidentialité",
    agreeEnd: ", et j'ai 18 ans ou plus.",
    updates: "Envoyez-moi les nouvelles de Build Week par e-mail (désinscription possible à tout moment)",
    submit: "Envoyer ma participation",
    sending: "Envoi...",
    successTitle: "C'est enregistré !",
    successBody:
      "Merci. Nous vous écrirons si votre idée est retenue. Vérifiez que votre idée est bien publiée dans le groupe pour que l'on puisse voter pour elle.",
    verify: "Veuillez effectuer la vérification ci-dessus.",
    errorGeneric: "Une erreur s'est produite. Veuillez réessayer.",
    errorNetwork: "Erreur réseau. Veuillez réessayer.",
  },
  share: {
    title: "Vous connaissez quelqu'un avec une excellente idée ?",
    text: "Proposez un Butler. Nous le construisons en une semaine, sinon accès à vie : Influencer Butler Build Week.",
    shareTitle: "Influencer Butler Build Week",
    on: "Partager sur",
    email: "E-mail",
    copyLink: "Copier le lien",
    copied: "Copié !",
  },
  price: "À noter : les tarifs d'Influencer Butler Pro augmentent fin novembre. Commencez votre essai gratuit maintenant et vous partez au tarif d'aujourd'hui.",
  trial: "Essayez Influencer Butler gratuitement pendant 14 jours",
  faqTitle: "Questions",
  faq: [
    {
      q: "Dois-je acheter quoi que ce soit pour participer ?",
      a: "Non. Proposer et voter est gratuit, et aucun achat n'est nécessaire pour être éligible au prix de la garantie. Il n'est pas nécessaire d'être client d'Influencer Butler.",
    },
    {
      q: "Comment les 10 idées sont-elles choisies ?",
      a: "Sept vont aux idées les plus réagies, comptées parmi les membres du groupe à la clôture du vote le 31 octobre à 23 h 59, heure des Rocheuses. Nous choisissons les trois autres nous-mêmes, pour que les belles idées de petits comptes aient aussi leur chance.",
    },
    {
      q: "Que signifie \"construite selon une norme de fonctionnement\" ?",
      a: "Elle est dans une version publiée de l'appli que vous pouvez utiliser, elle remplit la tâche principale décrite lors de nos tests sur le vrai site, elle ne plante pas et ne perd pas de données, et elle a une page d'aide. Les petits défauts esthétiques ne comptent pas.",
    },
    {
      q: "Que reçois-je si vous ne pouvez pas construire mon idée ?",
      a: "Une licence à vie Influencer Butler Pro Solo pour vous et une pour un ami que vous désignez. Si nous la construisons, vous obtenez le nouveau Butler et une mention publique pour l'idée.",
    },
    {
      q: "Que signifie \"à vie\" ?",
      a: "Tant que le forfait Pro Solo est proposé par nous ou par le futur propriétaire d'Influencer Butler. Elle est pour un seul appareil, ne peut être ni vendue, ni transférée, ni échangée contre de l'argent, et peut prendre fin en cas d'abus. Voir le règlement officiel pour les détails.",
    },
    {
      q: "Que devient mon idée ?",
      a: "Les idées sont publiées publiquement dans le groupe. En la proposant, vous nous autorisez à nous en inspirer, et ce que nous construisons nous appartient. Vous êtes crédité, et la garantie s'applique si nous échouons.",
    },
    {
      q: "Qui peut recevoir le prix ?",
      a: "Tout le monde peut proposer et voter. Pour recevoir un prix de la garantie, vous devez résider aux États-Unis, avoir 18 ans ou plus et être membre du groupe.",
    },
    {
      q: "Facebook est-il impliqué ?",
      a: "Non. Build Week n'est ni parrainée, ni approuvée, ni gérée par Facebook ou Meta. Elle est organisée par The Social Media Posse LLC.",
    },
  ],
  rulesNote: "Le règlement officiel est en anglais et la version anglaise prévaut. Cette page est affichée dans d'autres langues par commodité.",
  languageLabel: "Langue",
};

export const BUILD_WEEK_COPY: Record<BuildWeekLocale, BuildWeekCopy> = {
  "en-US": EN,
  "es-ES": ES,
  "fr-FR": FR,
};

export function buildWeekCopy(locale: BuildWeekLocale): BuildWeekCopy {
  return BUILD_WEEK_COPY[locale] ?? EN;
}
