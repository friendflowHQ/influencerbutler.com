import type { Locale } from "../i18n/catalog";

// Strings for the API Integrations options page. Kept separate from the shared
// popup/content catalog so this settings-heavy surface does not bloat those
// bundles. Brand and provider names stay in English on purpose, like the rest
// of the extension. No em dashes anywhere (repo rule).

export interface OptionsDict {
  pageTitle: string;
  pageIntro: string;
  securityNote: string;
  affiliateDisclosure: string;
  runAllTests: string;
  runningTests: string;
  testOnStartup: string;
  affiliateRouting: string;
  primaryDeeplink: string;
  primaryDeeplinkNone: string;
  primaryDeeplinkHint: string;
  // Shown under the dropdown when the branded-link provider is selected but the
  // extension has no license key, so every link stays a plain Amazon link.
  primaryDeeplinkSignIn: string;
  perCountryHeading: string;
  perCountryHint: string;
  addCountry: string;
  countryCode: string;
  affiliateTag: string;
  testBtn: string;
  testing: string;
  save: string;
  saving: string;
  saved: string;
  showMeWhere: string;
  participatesLabel: string;
  secretSavedPlaceholder: string;
  statusOk: string;
  statusFail: string;
  statusUntested: string;
  permissionDenied: string;
  // Category headings
  catAi: string;
  catProductData: string;
  catAffiliateTag: string;
  catDeeplink: string;
  catAffiliateNetwork: string;
  catWalmartLink: string;
  // Provider labels (referenced by adapter.labelKey)
  provOpenai: string;
  provCreatorsApi: string;
  provAssociates: string;
  provInfluencerButler: string;
  provInfluencerButlerDesc: string;
  provLinktwin: string;
  provUrlgenius: string;
  provGeniuslink: string;
  provSelfhosted: string;
  provLevanta: string;
  provArcher: string;
  provLogie: string;
  provBenable: string;
  provWalmartCreator: string;
  provWalmartCreatorDesc: string;
  provMavely: string;
  provMavelyDesc: string;
  // Field labels (referenced by field.labelKey)
  fieldApiKey: string;
  fieldApiSecret: string;
  fieldGroupId: string;
  fieldUsername: string;
  fieldPassword: string;
  fieldModel: string;
  recommendedSuffix: string;
  fieldAccessKey: string;
  fieldSecretKey: string;
  fieldPartnerTag: string;
  fieldMarketplace: string;
  fieldLinkTemplate: string;
  fieldReferralUrl: string;
  // Walmart affiliate link provider select
  walmartLink: string;
  walmartLinkNone: string;
  walmartLinkHint: string;
  // Voiceover Butler section
  voHeading: string;
  voIntro: string;
  voProfileGroup: string;
  voTone: string;
  voTonePlaceholder: string;
  voNiche: string;
  voNichePlaceholder: string;
  voAudience: string;
  voAudiencePlaceholder: string;
  voDefaultsGroup: string;
  voLength: string;
  voLengthCustom: string;
  voVideoType: string;
  voVtSocialHook: string;
  voVtTutorial: string;
  voVtUnboxing: string;
  voVtProblemSolution: string;
  voVtEduStory: string;
  voVtProductSetup: string;
  voHookStyle: string;
  voHookJokePun: string;
  voHookRelatable: string;
  voHook30Day: string;
  voHookTiredOf: string;
  voHookBoldClaim: string;
  voHookQuestion: string;
  voHookSurprise: string;
  voHookCustomOption: string;
  voHookCustomLine: string;
  voHookCustomPlaceholder: string;
  voPacing: string;
  voPaceSlow: string;
  voPaceStandard: string;
  voPaceFast: string;
  voDisclosure: string;
  voDiscHonestPaid: string;
  voDiscAffiliate: string;
  voDiscFreePr: string;
  voDiscNone: string;
  voAboutGroup: string;
  voAboutHint: string;
  voHeight: string;
  voTopSize: string;
  voBustSize: string;
  voDressSize: string;
  voPantSize: string;
  voShoeSize: string;
  voHairColor: string;
  voEyeColor: string;
  voSkinTone: string;
  voPreferredColors: string;
  voPreferredStyles: string;
  voDenyGroup: string;
  voDenyLabel: string;
  voDenyHint: string;
}

const en: OptionsDict = {
  pageTitle: "API Integrations",
  pageIntro:
    "Connect the same providers the desktop app uses. Paste a key, test it, and the extension uses it while you browse Amazon.",
  securityNote:
    "Your keys stay on this device, encrypted, and are sent only to each provider. They never touch Influencer Butler servers.",
  affiliateDisclosure:
    "Affiliate disclosure: Influencer Butler builds affiliate links for the products you choose, tagged with your own Amazon Associates account and any networks you connect here, so qualifying purchases earn you a commission. It never uses our tag or takes a cut.",
  runAllTests: "Run all saved tests",
  runningTests: "Testing every saved integration...",
  testOnStartup: "Test all integrations when the browser starts",
  affiliateRouting: "Rewrite Amazon links through my affiliate setup",
  primaryDeeplink: "Primary deeplink provider",
  primaryDeeplinkNone: "None (affiliate tag only)",
  primaryDeeplinkHint:
    "This decides what Copy my link hands you. With none selected you get the full Amazon url with your affiliate tag showing in it. Pick Influencer Butler branded links to get a short link instead: your tag stays out of what you post and your clicks are counted. It is free on any plan and needs no setup beyond being signed in.",
  primaryDeeplinkSignIn:
    "You are not signed in, so branded links cannot be created yet. Open the Influencer Butler extension popup and enter your license key. Until then your links stay plain Amazon links with your affiliate tag.",
  perCountryHeading: "Affiliate tag per country",
  perCountryHint: "US falls back to your storefront handle when left blank.",
  addCountry: "Add country",
  countryCode: "Country",
  affiliateTag: "Tag",
  testBtn: "Test Connection",
  testing: "Testing...",
  save: "Save",
  saving: "Saving...",
  saved: "Saved",
  showMeWhere: "Show me where",
  participatesLabel: "Use in affiliate routing",
  secretSavedPlaceholder: "Saved. Leave blank to keep it.",
  statusOk: "Connected",
  statusFail: "Not working",
  statusUntested: "Not tested",
  permissionDenied: "Permission to reach that provider was declined.",
  catAi: "AI",
  catProductData: "Product data",
  catAffiliateTag: "Affiliate tags",
  catDeeplink: "Deeplink providers",
  catAffiliateNetwork: "Affiliate networks",
  catWalmartLink: "Walmart affiliate links",
  provOpenai: "OpenAI",
  provCreatorsApi: "Amazon Creators API",
  provAssociates: "Amazon Associates tags",
  provInfluencerButler: "Influencer Butler branded links",
  provInfluencerButlerDesc:
    "Turn your links into short links.influencerbutler.com links with click analytics. No setup: it uses your signed-in license. Free on any plan.",
  provLinktwin: "Linktw.in",
  provUrlgenius: "URLGenius",
  provGeniuslink: "Geniuslink",
  provSelfhosted: "Self-hosted",
  provLevanta: "Levanta",
  provArcher: "Archer",
  provLogie: "Logie",
  provBenable: "Benable",
  provWalmartCreator: "Walmart Creator",
  provWalmartCreatorDesc:
    "The Walmart Creator program. Sign in at creator.walmart.com in this browser and the butler mints real walmrt.us short links from your session. No ids or API keys needed.",
  provMavely: "Mavely",
  provMavelyDesc:
    "Mavely link minting. Sign in at creators.joinmavely.com in this browser and your Walmart links mint as mave.ly short links. There is no API key.",
  walmartLink: "Walmart affiliate links",
  walmartLinkNone: "None (plain Walmart links)",
  walmartLinkHint:
    "Which provider mints your Walmart links when you Copy my link on a Walmart product. Both work from a signed-in browser session: join Walmart Creator at creator.walmart.com (no follower minimum) or Mavely at creators.joinmavely.com, sign in there, then pick it here.",
  fieldApiKey: "API key",
  fieldApiSecret: "API secret",
  fieldGroupId: "Group id",
  fieldUsername: "Username or email",
  fieldPassword: "Password",
  fieldModel: "Model",
  recommendedSuffix: "(recommended)",
  fieldAccessKey: "Access key",
  fieldSecretKey: "Secret key",
  fieldPartnerTag: "Partner tag",
  fieldMarketplace: "Marketplace (optional)",
  fieldLinkTemplate: "Link pattern",
  fieldReferralUrl: "Referral link",
  voHeading: "Voiceover Butler",
  voIntro:
    "Draft spoken video scripts on any Amazon product page with the Draft voiceover (AI) button in the My link panel. It uses your own OpenAI key from the AI section above. These settings shape every script.",
  voProfileGroup: "Creator profile",
  voTone: "Tone",
  voTonePlaceholder: "Friendly, dry humor, high energy...",
  voNiche: "Niche",
  voNichePlaceholder: "Home organization, budget beauty...",
  voAudience: "Target audience",
  voAudiencePlaceholder: "Busy moms, college students...",
  voDefaultsGroup: "Script defaults",
  voLength: "Script length (seconds)",
  voLengthCustom: "Custom",
  voVideoType: "Video type",
  voVtSocialHook: "Social media hook & script",
  voVtTutorial: "Tutorial",
  voVtUnboxing: "Unboxing",
  voVtProblemSolution: "Problem / solution",
  voVtEduStory: "Educational & storytelling",
  voVtProductSetup: "Product setup / introduction",
  voHookStyle: "Opening hook",
  voHookJokePun: "Joke or pun",
  voHookRelatable: "Relatable scenario",
  voHook30Day: "30-day review",
  voHookTiredOf: "Tired of [problem]?",
  voHookBoldClaim: "Bold claim or stat",
  voHookQuestion: "Direct question",
  voHookSurprise: "Surprise reveal",
  voHookCustomOption: "Custom",
  voHookCustomLine: "Custom hook line",
  voHookCustomPlaceholder: "Your exact opening line",
  voPacing: "Pacing",
  voPaceSlow: "Slow & contemplative",
  voPaceStandard: "Standard",
  voPaceFast: "Fast & punchy",
  voDisclosure: "FTC disclosure",
  voDiscHonestPaid: "Honest paid sample",
  voDiscAffiliate: "Affiliate link",
  voDiscFreePr: "Free PR sample",
  voDiscNone: "No disclosure (organic)",
  voAboutGroup: "About Me: fit & styling",
  voAboutHint:
    'Only used when the product looks like clothing, shoes, or beauty: the script can ground sizing in your own fit (for example "I\'m 5\'6 and wear a medium"). Leave blank to skip.',
  voHeight: "Height",
  voTopSize: "Top size",
  voBustSize: "Bust size",
  voDressSize: "Dress size",
  voPantSize: "Pant size",
  voShoeSize: "Shoe size",
  voHairColor: "Hair color",
  voEyeColor: "Eye color",
  voSkinTone: "Skin tone / undertone",
  voPreferredColors: "Preferred colors",
  voPreferredStyles: "Preferred styles",
  voDenyGroup: "Brand denylist",
  voDenyLabel: "Brands to never mention (comma separated)",
  voDenyHint:
    "Scripts are told to avoid these brand names, and every draft is checked afterward: if one slips through you get a warning under the script.",
};

const es: OptionsDict = {
  pageTitle: "Integraciones de API",
  pageIntro:
    "Conecta los mismos proveedores que usa la app de escritorio. Pega una clave, pruébala y la extensión la usa mientras navegas por Amazon.",
  securityNote:
    "Tus claves se quedan en este dispositivo, cifradas, y solo se envían a cada proveedor. Nunca pasan por los servidores de Influencer Butler.",
  affiliateDisclosure:
    "Divulgación de afiliados: Influencer Butler crea enlaces de afiliado para los productos que elijas, con tu propia cuenta de Amazon Associates y las redes que conectes aquí, así que las compras que califiquen te generan una comisión. Nunca usa nuestra etiqueta ni se queda con una parte.",
  runAllTests: "Probar todo lo guardado",
  runningTests: "Probando cada integración guardada...",
  testOnStartup: "Probar todas las integraciones al iniciar el navegador",
  affiliateRouting: "Reescribir enlaces de Amazon con mi configuración de afiliado",
  primaryDeeplink: "Proveedor de deeplink principal",
  primaryDeeplinkNone: "Ninguno (solo etiqueta de afiliado)",
  primaryDeeplinkHint:
    "Esto decide qué te da Copiar mi enlace. Sin ninguno seleccionado obtienes la url completa de Amazon con tu etiqueta de afiliado a la vista. Elige Enlaces de marca de Influencer Butler para obtener un enlace corto: tu etiqueta no aparece en lo que publicas y se cuentan tus clics. Es gratis en cualquier plan y no necesita más configuración que haber iniciado sesión.",
  primaryDeeplinkSignIn:
    "No has iniciado sesión, así que todavía no se pueden crear enlaces de marca. Abre la ventana de la extensión Influencer Butler e introduce tu clave de licencia. Hasta entonces, tus enlaces seguirán siendo enlaces normales de Amazon con tu etiqueta de afiliado.",
  perCountryHeading: "Etiqueta de afiliado por país",
  perCountryHint: "EE. UU. usa tu identificador de tienda si lo dejas en blanco.",
  addCountry: "Añadir país",
  countryCode: "País",
  affiliateTag: "Etiqueta",
  testBtn: "Probar conexión",
  testing: "Probando...",
  save: "Guardar",
  saving: "Guardando...",
  saved: "Guardado",
  showMeWhere: "Muéstrame dónde",
  participatesLabel: "Usar en el enrutado de afiliados",
  secretSavedPlaceholder: "Guardada. Déjalo en blanco para conservarla.",
  statusOk: "Conectado",
  statusFail: "No funciona",
  statusUntested: "Sin probar",
  permissionDenied: "Se rechazó el permiso para acceder a ese proveedor.",
  catAi: "IA",
  catProductData: "Datos de producto",
  catAffiliateTag: "Etiquetas de afiliado",
  catDeeplink: "Proveedores de deeplink",
  catAffiliateNetwork: "Redes de afiliados",
  catWalmartLink: "Enlaces de afiliado de Walmart",
  provOpenai: "OpenAI",
  provCreatorsApi: "Amazon Creators API",
  provAssociates: "Etiquetas de Amazon Associates",
  provInfluencerButler: "Enlaces de marca de Influencer Butler",
  provInfluencerButlerDesc:
    "Convierte tus enlaces en enlaces cortos de links.influencerbutler.com con analítica de clics. Sin configuración: usa tu licencia iniciada. Gratis en cualquier plan.",
  provLinktwin: "Linktw.in",
  provUrlgenius: "URLGenius",
  provGeniuslink: "Geniuslink",
  provSelfhosted: "Autoalojado",
  provLevanta: "Levanta",
  provArcher: "Archer",
  provLogie: "Logie",
  provBenable: "Benable",
  provWalmartCreator: "Walmart Creator",
  provWalmartCreatorDesc:
    "El programa Walmart Creator. Inicia sesión en creator.walmart.com en este navegador y el butler crea enlaces cortos walmrt.us reales desde tu sesión. Sin ids ni claves de API.",
  provMavely: "Mavely",
  provMavelyDesc:
    "Creación de enlaces con Mavely. Inicia sesión en creators.joinmavely.com en este navegador y tus enlaces de Walmart se crean como enlaces cortos mave.ly. No hay clave de API.",
  walmartLink: "Enlaces de afiliado de Walmart",
  walmartLinkNone: "Ninguno (enlaces de Walmart sin seguimiento)",
  walmartLinkHint:
    "Qué proveedor crea tus enlaces de Walmart cuando usas Copiar mi enlace en un producto de Walmart. Ambos funcionan con una sesión iniciada en el navegador: únete a Walmart Creator en creator.walmart.com (sin mínimo de seguidores) o a Mavely en creators.joinmavely.com, inicia sesión allí y elígelo aquí.",
  fieldApiKey: "Clave de API",
  fieldApiSecret: "Secreto de API",
  fieldGroupId: "Id de grupo",
  fieldUsername: "Usuario o correo",
  fieldPassword: "Contraseña",
  fieldModel: "Modelo",
  recommendedSuffix: "(recomendado)",
  fieldAccessKey: "Clave de acceso",
  fieldSecretKey: "Clave secreta",
  fieldPartnerTag: "Etiqueta de socio",
  fieldMarketplace: "Mercado (opcional)",
  fieldLinkTemplate: "Patrón de enlace",
  fieldReferralUrl: "Enlace de referido",
  voHeading: "Voiceover Butler",
  voIntro:
    "Redacta guiones de voz para vídeos en cualquier página de producto de Amazon con el botón Redactar guion de voz (IA) del panel Mi enlace. Usa tu propia clave de OpenAI de la sección IA de arriba. Estos ajustes dan forma a cada guion.",
  voProfileGroup: "Perfil de creador",
  voTone: "Tono",
  voTonePlaceholder: "Cercano, humor seco, mucha energía...",
  voNiche: "Nicho",
  voNichePlaceholder: "Organización del hogar, belleza económica...",
  voAudience: "Audiencia objetivo",
  voAudiencePlaceholder: "Madres ocupadas, estudiantes...",
  voDefaultsGroup: "Valores por defecto del guion",
  voLength: "Duración del guion (segundos)",
  voLengthCustom: "Personalizada",
  voVideoType: "Tipo de vídeo",
  voVtSocialHook: "Gancho y guion para redes",
  voVtTutorial: "Tutorial",
  voVtUnboxing: "Unboxing",
  voVtProblemSolution: "Problema / solución",
  voVtEduStory: "Educativo y narrativo",
  voVtProductSetup: "Preparación / presentación del producto",
  voHookStyle: "Gancho de apertura",
  voHookJokePun: "Broma o juego de palabras",
  voHookRelatable: "Escena cotidiana",
  voHook30Day: "Reseña a 30 días",
  voHookTiredOf: "¿Cansado de [problema]?",
  voHookBoldClaim: "Afirmación o dato llamativo",
  voHookQuestion: "Pregunta directa",
  voHookSurprise: "Revelación sorpresa",
  voHookCustomOption: "Personalizado",
  voHookCustomLine: "Frase de gancho personalizada",
  voHookCustomPlaceholder: "Tu frase de apertura exacta",
  voPacing: "Ritmo",
  voPaceSlow: "Lento y contemplativo",
  voPaceStandard: "Estándar",
  voPaceFast: "Rápido y directo",
  voDisclosure: "Divulgación FTC",
  voDiscHonestPaid: "Muestra pagada honesta",
  voDiscAffiliate: "Enlace de afiliado",
  voDiscFreePr: "Muestra de PR gratuita",
  voDiscNone: "Sin divulgación (orgánico)",
  voAboutGroup: "Sobre mí: talla y estilo",
  voAboutHint:
    'Solo se usa cuando el producto parece ropa, calzado o belleza: el guion puede basar las tallas en tu propio cuerpo (por ejemplo "mido 1,68 y uso la talla M"). Déjalo en blanco para omitirlo.',
  voHeight: "Estatura",
  voTopSize: "Talla de camiseta",
  voBustSize: "Talla de pecho",
  voDressSize: "Talla de vestido",
  voPantSize: "Talla de pantalón",
  voShoeSize: "Talla de calzado",
  voHairColor: "Color de pelo",
  voEyeColor: "Color de ojos",
  voSkinTone: "Tono de piel / subtono",
  voPreferredColors: "Colores preferidos",
  voPreferredStyles: "Estilos preferidos",
  voDenyGroup: "Lista de marcas prohibidas",
  voDenyLabel: "Marcas que nunca se deben mencionar (separadas por comas)",
  voDenyHint:
    "Se indica a los guiones que eviten estas marcas y cada borrador se revisa después: si alguna se cuela, verás un aviso debajo del guion.",
};

const fr: OptionsDict = {
  pageTitle: "Intégrations API",
  pageIntro:
    "Connectez les mêmes fournisseurs que l'app de bureau. Collez une clé, testez-la, et l'extension l'utilise pendant que vous naviguez sur Amazon.",
  securityNote:
    "Vos clés restent sur cet appareil, chiffrées, et ne sont envoyées qu'à chaque fournisseur. Elles ne passent jamais par les serveurs Influencer Butler.",
  affiliateDisclosure:
    "Divulgation d'affiliation : Influencer Butler crée des liens d'affiliation pour les produits que vous choisissez, associés à votre propre compte Amazon Associates et aux réseaux que vous connectez ici, afin que les achats admissibles vous rapportent une commission. Il n'utilise jamais notre balise et ne prend aucune commission.",
  runAllTests: "Tester tout ce qui est enregistré",
  runningTests: "Test de chaque intégration enregistrée...",
  testOnStartup: "Tester toutes les intégrations au démarrage du navigateur",
  affiliateRouting: "Réécrire les liens Amazon avec ma configuration d'affiliation",
  primaryDeeplink: "Fournisseur de deeplink principal",
  primaryDeeplinkNone: "Aucun (balise d'affiliation seule)",
  primaryDeeplinkHint:
    "Ce choix determine ce que Copier mon lien vous donne. Sans fournisseur selectionne, vous obtenez l'url Amazon complete avec votre balise d'affiliation visible. Choisissez Liens de marque Influencer Butler pour obtenir un lien court : votre balise reste hors de ce que vous publiez et vos clics sont comptes. C'est gratuit sur toute offre et ne demande aucune configuration au-dela de la connexion.",
  primaryDeeplinkSignIn:
    "Vous n'êtes pas connecté, donc les liens de marque ne peuvent pas encore être créés. Ouvrez la fenêtre de l'extension Influencer Butler et saisissez votre clé de licence. D'ici là, vos liens resteront des liens Amazon simples avec votre balise d'affiliation.",
  perCountryHeading: "Balise d'affiliation par pays",
  perCountryHint: "Les États-Unis utilisent votre identifiant de vitrine si laissé vide.",
  addCountry: "Ajouter un pays",
  countryCode: "Pays",
  affiliateTag: "Balise",
  testBtn: "Tester la connexion",
  testing: "Test...",
  save: "Enregistrer",
  saving: "Enregistrement...",
  saved: "Enregistré",
  showMeWhere: "Montrez-moi où",
  participatesLabel: "Utiliser dans le routage d'affiliation",
  secretSavedPlaceholder: "Enregistrée. Laissez vide pour la conserver.",
  statusOk: "Connecté",
  statusFail: "Ne fonctionne pas",
  statusUntested: "Non testé",
  permissionDenied: "L'autorisation d'accès à ce fournisseur a été refusée.",
  catAi: "IA",
  catProductData: "Données produit",
  catAffiliateTag: "Balises d'affiliation",
  catDeeplink: "Fournisseurs de deeplink",
  catAffiliateNetwork: "Réseaux d'affiliation",
  catWalmartLink: "Liens d'affiliation Walmart",
  provOpenai: "OpenAI",
  provCreatorsApi: "Amazon Creators API",
  provAssociates: "Balises Amazon Associates",
  provInfluencerButler: "Liens de marque Influencer Butler",
  provInfluencerButlerDesc:
    "Transformez vos liens en liens courts links.influencerbutler.com avec des statistiques de clics. Sans configuration : utilise votre licence connectée. Gratuit sur toute offre.",
  provLinktwin: "Linktw.in",
  provUrlgenius: "URLGenius",
  provGeniuslink: "Geniuslink",
  provSelfhosted: "Auto-hébergé",
  provLevanta: "Levanta",
  provArcher: "Archer",
  provLogie: "Logie",
  provBenable: "Benable",
  provWalmartCreator: "Walmart Creator",
  provWalmartCreatorDesc:
    "Le programme Walmart Creator. Connectez-vous sur creator.walmart.com dans ce navigateur et le butler crée de vrais liens courts walmrt.us depuis votre session. Aucun id ni clé API.",
  provMavely: "Mavely",
  provMavelyDesc:
    "Création de liens avec Mavely. Connectez-vous sur creators.joinmavely.com dans ce navigateur et vos liens Walmart deviennent des liens courts mave.ly. Il n'y a pas de clé API.",
  walmartLink: "Liens d'affiliation Walmart",
  walmartLinkNone: "Aucun (liens Walmart simples)",
  walmartLinkHint:
    "Quel fournisseur crée vos liens Walmart quand vous utilisez Copier mon lien sur un produit Walmart. Les deux fonctionnent avec une session connectée dans le navigateur : rejoignez Walmart Creator sur creator.walmart.com (sans minimum d'abonnés) ou Mavely sur creators.joinmavely.com, connectez-vous, puis choisissez-le ici.",
  fieldApiKey: "Clé API",
  fieldApiSecret: "Secret API",
  fieldGroupId: "Id de groupe",
  fieldUsername: "Nom d'utilisateur ou e-mail",
  fieldPassword: "Mot de passe",
  fieldModel: "Modèle",
  recommendedSuffix: "(recommandé)",
  fieldAccessKey: "Clé d'accès",
  fieldSecretKey: "Clé secrète",
  fieldPartnerTag: "Balise partenaire",
  fieldMarketplace: "Place de marché (facultatif)",
  fieldLinkTemplate: "Modèle de lien",
  fieldReferralUrl: "Lien de parrainage",
  voHeading: "Voiceover Butler",
  voIntro:
    "Rédigez des scripts voix off sur n'importe quelle page produit Amazon avec le bouton Rédiger un script voix off (IA) du panneau Mon lien. Il utilise votre propre clé OpenAI de la section IA ci-dessus. Ces réglages façonnent chaque script.",
  voProfileGroup: "Profil de créateur",
  voTone: "Ton",
  voTonePlaceholder: "Chaleureux, humour pince-sans-rire, très énergique...",
  voNiche: "Niche",
  voNichePlaceholder: "Organisation de la maison, beauté petit budget...",
  voAudience: "Audience cible",
  voAudiencePlaceholder: "Mamans débordées, étudiants...",
  voDefaultsGroup: "Réglages par défaut du script",
  voLength: "Durée du script (secondes)",
  voLengthCustom: "Personnalisée",
  voVideoType: "Type de vidéo",
  voVtSocialHook: "Accroche et script pour les réseaux",
  voVtTutorial: "Tutoriel",
  voVtUnboxing: "Unboxing",
  voVtProblemSolution: "Problème / solution",
  voVtEduStory: "Éducatif et narratif",
  voVtProductSetup: "Installation / présentation du produit",
  voHookStyle: "Accroche d'ouverture",
  voHookJokePun: "Blague ou jeu de mots",
  voHookRelatable: "Scène du quotidien",
  voHook30Day: "Bilan après 30 jours",
  voHookTiredOf: "Fatigué de [problème] ?",
  voHookBoldClaim: "Affirmation ou statistique forte",
  voHookQuestion: "Question directe",
  voHookSurprise: "Révélation surprise",
  voHookCustomOption: "Personnalisée",
  voHookCustomLine: "Phrase d'accroche personnalisée",
  voHookCustomPlaceholder: "Votre phrase d'ouverture exacte",
  voPacing: "Rythme",
  voPaceSlow: "Lent et contemplatif",
  voPaceStandard: "Standard",
  voPaceFast: "Rapide et percutant",
  voDisclosure: "Mention FTC",
  voDiscHonestPaid: "Échantillon rémunéré honnête",
  voDiscAffiliate: "Lien d'affiliation",
  voDiscFreePr: "Échantillon PR gratuit",
  voDiscNone: "Sans mention (organique)",
  voAboutGroup: "À propos de moi : taille et style",
  voAboutHint:
    'Utilisé seulement quand le produit ressemble à un vêtement, une chaussure ou un produit de beauté : le script peut appuyer les tailles sur votre propre morphologie (par exemple "je mesure 1,68 m et porte du M"). Laissez vide pour ignorer.',
  voHeight: "Taille (stature)",
  voTopSize: "Taille de haut",
  voBustSize: "Tour de poitrine",
  voDressSize: "Taille de robe",
  voPantSize: "Taille de pantalon",
  voShoeSize: "Pointure",
  voHairColor: "Couleur de cheveux",
  voEyeColor: "Couleur des yeux",
  voSkinTone: "Carnation / sous-ton",
  voPreferredColors: "Couleurs préférées",
  voPreferredStyles: "Styles préférés",
  voDenyGroup: "Liste de marques interdites",
  voDenyLabel: "Marques à ne jamais mentionner (séparées par des virgules)",
  voDenyHint:
    "Les scripts reçoivent la consigne d'éviter ces marques et chaque brouillon est vérifié ensuite : si l'une d'elles passe, un avertissement s'affiche sous le script.",
};

export const OPTIONS_CATALOG: Record<Locale, OptionsDict> = { en, es, fr };
