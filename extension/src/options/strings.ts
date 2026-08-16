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
  // Field labels (referenced by field.labelKey)
  fieldApiKey: string;
  fieldApiSecret: string;
  fieldGroupId: string;
  fieldToken: string;
  fieldUsername: string;
  fieldPassword: string;
  fieldModel: string;
  fieldAccessKey: string;
  fieldSecretKey: string;
  fieldPartnerTag: string;
  fieldMarketplace: string;
  fieldLinkTemplate: string;
  fieldReferralUrl: string;
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
  fieldApiKey: "API key",
  fieldApiSecret: "API secret",
  fieldGroupId: "Group id",
  fieldToken: "Token or API key",
  fieldUsername: "Username or email",
  fieldPassword: "Password",
  fieldModel: "Model (optional)",
  fieldAccessKey: "Access key",
  fieldSecretKey: "Secret key",
  fieldPartnerTag: "Partner tag",
  fieldMarketplace: "Marketplace (optional)",
  fieldLinkTemplate: "Link pattern",
  fieldReferralUrl: "Referral link",
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
  fieldApiKey: "Clave de API",
  fieldApiSecret: "Secreto de API",
  fieldGroupId: "Id de grupo",
  fieldToken: "Token o clave de API",
  fieldUsername: "Usuario o correo",
  fieldPassword: "Contraseña",
  fieldModel: "Modelo (opcional)",
  fieldAccessKey: "Clave de acceso",
  fieldSecretKey: "Clave secreta",
  fieldPartnerTag: "Etiqueta de socio",
  fieldMarketplace: "Mercado (opcional)",
  fieldLinkTemplate: "Patrón de enlace",
  fieldReferralUrl: "Enlace de referido",
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
  fieldApiKey: "Clé API",
  fieldApiSecret: "Secret API",
  fieldGroupId: "Id de groupe",
  fieldToken: "Jeton ou clé API",
  fieldUsername: "Nom d'utilisateur ou e-mail",
  fieldPassword: "Mot de passe",
  fieldModel: "Modèle (facultatif)",
  fieldAccessKey: "Clé d'accès",
  fieldSecretKey: "Clé secrète",
  fieldPartnerTag: "Balise partenaire",
  fieldMarketplace: "Place de marché (facultatif)",
  fieldLinkTemplate: "Modèle de lien",
  fieldReferralUrl: "Lien de parrainage",
};

export const OPTIONS_CATALOG: Record<Locale, OptionsDict> = { en, es, fr };
