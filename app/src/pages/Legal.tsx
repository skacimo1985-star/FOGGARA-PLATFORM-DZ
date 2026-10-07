import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Mail, MapPin, Phone, Send } from "lucide-react";
import { api } from "@/lib/api";
import "./operations.css";

type Lang = "ar" | "fr" | "en";
type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  extra?: ReactNode;
};
type PageCopy = {
  title: string;
  note?: string;
  intro?: string;
  sections: Section[];
};

const privacyLawLinks = (
  <>
    <a href="https://www.joradp.dz/FTP/JO-FRANCAIS/2018/F2018034.pdf" target="_blank" rel="noreferrer">18-07</a>
    {" · "}
    <a href="https://www.joradp.dz/FTP/jo-francais/2025/F2025048.pdf" target="_blank" rel="noreferrer">25-11</a>
  </>
);

const ecommerceLawLink = (
  <a href="https://www.joradp.dz/FTP/JO-FRANCAIS/2018/F2018028.pdf" target="_blank" rel="noreferrer">18-05</a>
);

const imageAttribution = (
  <>
    Bernard Gagnon ·{" "}
    <a href="https://commons.wikimedia.org/wiki/File:Foggara_in_Tala.jpg" target="_blank" rel="noreferrer">Wikimedia Commons</a>
    {" · "}
    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
  </>
);

const pages: Record<Lang, Record<"about" | "privacy" | "terms" | "rights", PageCopy>> = {
  ar: {
    about: {
      title: "من الأرض… إلى مستقبل مترابط.",
      sections: [
        {
          title: "بنية رقمية تربط منظومة الإنتاج",
          paragraphs: [
            "فقارة هي منصة رقمية لمشروع SIREP OASIS NEXUS TECH DZ تطورها EURL SIREP OASIS NEXUS WEFEH في الأغواط، الجزائر. تجمع المعلومات والعمليات والخدمات لربط الموارد والمنتجين والمورّدين والخبراء والمؤسسات والأسواق.",
            "تعتمد مقاربة WEFEH التي تنظر إلى المياه والطاقة والغذاء والنظم البيئية والصحة باعتبارها مجالات مترابطة، وتخدم الزراعة والواحات والإنتاج والتحويل والتثمين والخدمات والمعدات والتتبّع واللوجستيك.",
          ],
        },
        {
          title: "من القياس إلى قرار يمكن تتبّعه",
          paragraphs: [
            "تبدأ دورة العمل بمشروع وقياسات ومراجع، ثم مراجعة البيانات وتحليلها وتقييم المؤشرات، وصولًا إلى القرار البشري والإجراء والمتابعة والتدقيق. اقتراحات النظام أدوات دعم للقرار ولا تُعد اعتمادًا أو أمرًا ميدانيًا تلقائيًا.",
          ],
        },
        {
          title: "ثلاث طبقات متكاملة",
          bullets: [
            "خدمات هندسية وخبرة متخصصة.",
            "منتجات برمجية وتنظيم المعلومات والعمليات.",
            "أنظمة ميدانية وأجهزة ومراقبة بحسب الربط الفعلي المتاح لكل مشروع.",
          ],
          paragraphs: [
            "السجلات الموسومة DEMO بيانات توضيحية. لا يُفترض وجود ربط ميداني أو اعتماد مهني أو تغطية جغرافية لمجرد ظهور وحدة في الواجهة.",
          ],
        },
        {
          title: "الجهة الناشرة",
          paragraphs: [
            "EURL SIREP OASIS NEXUS WEFEH · السجل التجاري: 0924154-26 · الرقم الجبائي: 002603092415466، وفق وثيقة التعريف المقدمة للمشروع.",
            "المؤسس والمسير: MAHROUG ERRAS BELKACEM. العنوان: Cité 65 Villa El-Maamoura, 03000 Laghouat, Algérie.",
          ],
        },
      ],
    },
    privacy: {
      title: "سياسة الخصوصية",
      note: "نسخة السياسة: 2026-10-02. يجب على الجهة المشغلة مواءمة الاستضافة ومدد الاحتفاظ والمتعهدين وإجراءات حماية البيانات مع التشغيل الفعلي. هذه الصفحة لا تشهد باستكمال أي إجراء تنظيمي غير متحقق منه.",
      sections: [
        {
          title: "المسؤول والغرض من المعالجة",
          paragraphs: [
            "تستخدم بيانات الحساب والمؤسسة لإدارة الوصول والصلاحيات، وبيانات المشاريع والقياسات والأدلة لتقديم الخدمات والتقييم والتتبّع، وسجلات العمليات للأمن والمراجعة. يستخدم نموذج التواصل الاسم والبريد والموضوع والرسالة للرد على الطلب.",
          ],
        },
        {
          title: "ما الذي يُجمع؟",
          paragraphs: [
            "قد تشمل البيانات الاسم والبريد والمؤسسة والدور، والمشاريع والمواقع والقياسات والمراجع والطلبات وسجلات العمليات. يسجل الخادم بيانات تشغيلية مثل مسار الطلب وحالته ومدته، ولا تُسجل كلمات المرور في سجل الطلبات.",
            "لا تضع معلومات صحية شخصية أو أسرارًا غير لازمة في حقول القياسات أو الرسائل. مجال الصحة في WEFEH مخصص لمؤشرات المشروع ولا يقدم تشخيصًا طبيًا.",
          ],
        },
        {
          title: "الوصول والمشاركة",
          paragraphs: [
            "تُقيد سجلات التشغيل بالمؤسسة وصلاحيات المستخدم. لا تُنشر عروضك وطلباتك تلقائيًا كسوق عام. أي مشاركة خارجية أو متعهد إضافي يجب أن يكون له غرض وأساس وضمانات مناسبة.",
          ],
        },
        {
          title: "الاستضافة والنقل خارج الجزائر",
          paragraphs: [
            "مكان الاستضافة يعتمد على إعداد النشر الفعلي. لا يعني وصف المنصة بأنها سيادية أن البيانات مستضافة تلقائيًا داخل الجزائر. يجب تقييم النقل خارج الجزائر والإجراءات المطلوبة بموجب قانون حماية البيانات وتعديلاته قبل معالجة بيانات شخصية في استضافة خارجية.",
          ],
        },
        {
          title: "الاحتفاظ وحقوقك",
          paragraphs: [
            "يجب اعتماد مدد احتفاظ بحسب الغرض والالتزامات القانونية وتنفيذ المحو أو إخفاء الهوية عند زوال الحاجة، مع مراعاة النسخ الاحتياطية.",
            "يمكن تقديم طلب وصول أو تصحيح أو محو أو اعتراض أو تقييد عبر مساحة العمل أو صفحة التواصل. تسجيل الطلب لا يعني قبوله تلقائيًا؛ تتم مراجعته وفق الهوية والالتزامات القانونية المعمول بها.",
          ],
        },
        {
          title: "المراجع",
          paragraphs: ["قانون حماية المعطيات ذات الطابع الشخصي وتعديلاته:"],
          extra: privacyLawLinks,
        },
      ],
    },
    terms: {
      title: "شروط الاستخدام",
      note: "نسخة الشروط: 2026-10-02 · تخضع العقود المهنية الخاصة والأحكام القانونية الإلزامية للأولوية عند انطباقها.",
      sections: [
        {
          title: "نطاق الخدمة",
          paragraphs: ["توفر فقارة مساحة لتنظيم المشاريع والقياسات والمراجعات ومؤشرات WEFEH والقرارات والفرص. تعتمد النتائج على البيانات والقواعد المتاحة، ويجب التمييز بين الأنظمة الموصولة فعليًا والمحاكاة أو البيانات التجريبية."],
        },
        {
          title: "الحسابات والاستخدام المسموح",
          paragraphs: ["يجب استخدام حساب مصرح به وحماية بيانات الدخول وإدخال بيانات لديك حق استخدامها. يمنع تجاوز عزل المؤسسات أو تحميل برمجيات ضارة أو انتحال صفة أو تقديم بيانات مضللة."],
        },
        {
          title: "المراجعة والمسؤولية",
          paragraphs: ["المؤشرات والتوصيات أدوات دعم للقرار وليست ضمانًا لنتيجة إنتاجية أو شهادة جودة أو توصية طبية أو مالية. يجب مراجعة المصدر والوحدة والحداثة والمنهجية قبل اعتماد أي قرار."],
        },
        {
          title: "العرض والطلب والتجارة الإلكترونية",
          paragraphs: ["المطابقة تقترح توافقات ولا تنشئ عقد بيع أو فاتورة أو دفعًا أو حجز مخزون تلقائيًا. إذا فُعّلت التجارة الإلكترونية فتطبق المتطلبات القانونية المناسبة بحسب النشاط."],
          extra: ecommerceLawLink,
        },
        {
          title: "التوفر والتغييرات والنزاعات",
          paragraphs: ["قد يتوقف الوصول للصيانة أو لأسباب أمنية أو تقنية. لا تنشئ الواجهة اتفاقية مستوى خدمة غير موقعة. تُراجع الاعتراضات أولًا مع الجهة المشغلة وتطبق القوانين والاختصاصات الواجبة دون إسقاط الحقوق الإلزامية."],
        },
      ],
    },
    rights: {
      title: "الحقوق والملكية الفكرية",
      sections: [
        {
          title: "المحتوى والبيانات",
          paragraphs: ["يحتفظ أصحاب البيانات والمحتوى بحقوقهم. إدخال المحتوى يمنح الجهة المشغلة صلاحية معالجته بالقدر اللازم لتقديم الخدمة وفق الغرض والصلاحيات المعتمدة، ولا يعني نقل الملكية."],
        },
        {
          title: "الاسم والبرمجيات",
          paragraphs: ["يستخدم اسم FOGGARA وهوية SIREP OASIS NEXUS WEFEH للتعريف بالمشروع والجهة الناشرة. لا تتضمن الصفحة ادعاءً بتسجيل علامة أو براءة أو اعتماد غير موثق. تخضع مكونات البرمجيات لتراخيصها المعنية."],
        },
        {
          title: "الصور والمصادر",
          paragraphs: ["نسبة صورة فقارة تالا المستخدمة في الواجهة:"],
          extra: imageAttribution,
        },
        {
          title: "الإبلاغ عن انتهاك",
          paragraphs: ["أرسل رابط المحتوى ووصف الحق ودليل الصفة ووسيلة التواصل عبر صفحة اتصل بنا. تُراجع البلاغات مع الحد من الكشف غير الضروري عن بيانات الأطراف."],
        },
      ],
    },
  },
  fr: {
    about: {
      title: "Du terrain à un avenir interconnecté.",
      sections: [
        {
          title: "Une infrastructure numérique pour relier la chaîne de production",
          paragraphs: [
            "FOGGARA est la plateforme numérique du projet SIREP OASIS NEXUS TECH DZ, développée par EURL SIREP OASIS NEXUS WEFEH à Laghouat, Algérie. Elle organise informations, opérations et services afin de relier ressources, producteurs, fournisseurs, experts, institutions et marchés.",
            "Son approche WEFEH traite l’eau, l’énergie, l’alimentation, les écosystèmes et la santé comme des domaines interdépendants.",
          ],
        },
        {
          title: "De la mesure à une décision traçable",
          paragraphs: ["Le cycle de travail part des projets, mesures et références, puis passe par la revue, l’analyse et les indicateurs avant une décision humaine, une action, un suivi et un audit. Les propositions de la plateforme restent des outils d’aide à la décision."],
        },
        {
          title: "Trois couches complémentaires",
          bullets: ["Ingénierie et expertise spécialisée.", "Logiciels et organisation des informations et processus.", "Systèmes terrain, équipements et supervision selon les connexions réellement disponibles."],
          paragraphs: ["Les enregistrements marqués DEMO sont illustratifs. L’affichage d’un module ne prouve ni une connexion terrain, ni une certification, ni une couverture géographique effective."],
        },
        {
          title: "Éditeur",
          paragraphs: ["EURL SIREP OASIS NEXUS WEFEH · RC : 0924154-26 · NIF : 002603092415466, selon le document d’identification fourni au projet.", "Fondateur et gérant : MAHROUG ERRAS BELKACEM. Adresse : Cité 65 Villa El-Maamoura, 03000 Laghouat, Algérie."],
        },
      ],
    },
    privacy: {
      title: "Politique de confidentialité",
      note: "Version : 2026-10-02. L’exploitant doit aligner l’hébergement, les durées de conservation, les sous-traitants et les mesures de protection sur le fonctionnement réel. Cette page ne certifie aucune formalité réglementaire non vérifiée.",
      sections: [
        { title: "Responsable et finalités", paragraphs: ["Les données de compte et d’organisation servent à gérer l’accès et les rôles ; les projets, mesures et preuves servent à fournir les services, analyses et suivis ; les journaux servent à la sécurité et à l’audit. Le formulaire de contact utilise les données nécessaires pour répondre à la demande."] },
        { title: "Données collectées", paragraphs: ["Peuvent être traités : identité, e-mail, organisation, rôle, projets, sites, mesures, références, demandes et journaux opérationnels. Le serveur peut journaliser le chemin de requête, son état et sa durée. Les mots de passe ne sont pas inscrits dans les journaux de requêtes.", "N’insérez pas de données de santé personnelles ou de secrets inutiles dans les champs de mesure ou de message. Le domaine Santé de WEFEH concerne des indicateurs de projet et ne fournit pas de diagnostic médical."] },
        { title: "Accès et partage", paragraphs: ["Les données opérationnelles sont limitées à l’organisation et aux autorisations de l’utilisateur. Les offres et demandes ne sont pas publiées automatiquement sur un marché public. Tout partage externe doit disposer d’une finalité, d’une base et de garanties appropriées."] },
        { title: "Hébergement et transfert hors d’Algérie", paragraphs: ["Le lieu réel d’hébergement dépend du déploiement. La qualification de plateforme souveraine ne signifie pas que les données sont automatiquement hébergées en Algérie. Les transferts de données personnelles doivent être évalués au regard de la loi applicable et de ses modifications."] },
        { title: "Conservation et droits", paragraphs: ["Des durées de conservation doivent être définies selon les finalités et obligations. L’effacement ou l’anonymisation doit être appliqué lorsque la conservation n’est plus justifiée, sous réserve des sauvegardes et obligations légales.", "Les demandes d’accès, rectification, effacement, opposition ou limitation peuvent être soumises via l’espace de travail ou la page Contact. Leur enregistrement ne vaut pas acceptation automatique."] },
        { title: "Références", paragraphs: ["Loi algérienne sur la protection des données personnelles et modifications :"], extra: privacyLawLinks },
      ],
    },
    terms: {
      title: "Conditions d’utilisation",
      note: "Version : 2026-10-02 · Les contrats professionnels particuliers et les règles impératives applicables prévalent lorsqu’ils s’appliquent.",
      sections: [
        { title: "Périmètre du service", paragraphs: ["FOGGARA organise projets, mesures, revues, indicateurs WEFEH, décisions et opportunités. Les résultats dépendent des données et règles disponibles ; il faut distinguer les systèmes réellement connectés des simulations et données de démonstration."] },
        { title: "Comptes et usage autorisé", paragraphs: ["Utilisez uniquement un compte autorisé, protégez les identifiants et ne fournissez que des données que vous êtes autorisé à utiliser. Le contournement de l’isolation des organisations, les logiciels malveillants, l’usurpation et les données trompeuses sont interdits."] },
        { title: "Revue et responsabilité", paragraphs: ["Les indicateurs et recommandations sont des aides à la décision, pas une garantie de rendement, un certificat de qualité, ni un conseil médical ou financier. La source, l’unité, l’actualité et la méthode doivent être vérifiées avant décision."] },
        { title: "Offres, demandes et commerce électronique", paragraphs: ["La mise en correspondance suggère des compatibilités mais ne crée pas automatiquement un contrat, une facture, un paiement ou une réservation de stock. Si le commerce électronique est activé, les exigences applicables doivent être respectées."], extra: ecommerceLawLink },
        { title: "Disponibilité, changements et litiges", paragraphs: ["L’accès peut être interrompu pour maintenance, sécurité ou raisons techniques. L’interface ne crée pas de SLA non signé. Les contestations sont d’abord adressées à l’exploitant, sans renoncer aux droits impératifs."] },
      ],
    },
    rights: {
      title: "Droits et propriété intellectuelle",
      sections: [
        { title: "Contenu et données", paragraphs: ["Les propriétaires conservent leurs droits sur les données et contenus. Leur dépôt autorise l’exploitant à les traiter uniquement dans la mesure nécessaire à la fourniture du service et selon les autorisations applicables."] },
        { title: "Nom et logiciels", paragraphs: ["FOGGARA et l’identité SIREP OASIS NEXUS WEFEH identifient le projet et son éditeur. Cette page ne revendique aucune marque, brevet ou certification non vérifiée. Les composants logiciels restent soumis à leurs licences respectives."] },
        { title: "Images et sources", paragraphs: ["Attribution de l’image Foggara de Tala utilisée dans l’interface :"], extra: imageAttribution },
        { title: "Signaler une atteinte", paragraphs: ["Envoyez le lien du contenu, la description du droit, la preuve de votre qualité et un moyen de contact via la page Contact. Les signalements sont examinés en limitant la divulgation inutile de données personnelles."] },
      ],
    },
  },
  en: {
    about: {
      title: "From the field to an interconnected future.",
      sections: [
        {
          title: "Digital infrastructure connecting the production ecosystem",
          paragraphs: [
            "FOGGARA is the digital platform of the SIREP OASIS NEXUS TECH DZ project, developed by EURL SIREP OASIS NEXUS WEFEH in Laghouat, Algeria. It organizes information, operations and services to connect resources, producers, suppliers, experts, institutions and markets.",
            "Its WEFEH approach treats water, energy, food, ecosystems and health as interconnected domains.",
          ],
        },
        {
          title: "From measurement to traceable decision",
          paragraphs: ["The workflow starts with projects, measurements and references, then review, analysis and indicators, followed by human decision, action, monitoring and audit. Platform proposals remain decision-support outputs, not automatic approvals or field orders."],
        },
        {
          title: "Three complementary layers",
          bullets: ["Engineering services and specialist expertise.", "Software products and operational information management.", "Field systems, equipment and monitoring according to integrations actually available for each project."],
          paragraphs: ["Records marked DEMO are illustrative. A module appearing in the interface does not by itself prove live field connectivity, professional certification or geographic coverage."],
        },
        {
          title: "Publisher",
          paragraphs: ["EURL SIREP OASIS NEXUS WEFEH · Commercial register: 0924154-26 · Tax number: 002603092415466, according to the identification document supplied to the project.", "Founder and manager: MAHROUG ERRAS BELKACEM. Address: Cité 65 Villa El-Maamoura, 03000 Laghouat, Algeria."],
        },
      ],
    },
    privacy: {
      title: "Privacy policy",
      note: "Version: 2026-10-02. The operator must align hosting, retention periods, processors and data-protection measures with the actual deployment. This page does not certify completion of any unverified regulatory procedure.",
      sections: [
        { title: "Controller and purposes", paragraphs: ["Account and organization data are used for access and role management; project, measurement and evidence data support services, analysis and monitoring; operational logs support security and audit. The contact form uses the information needed to respond to the request."] },
        { title: "Data collected", paragraphs: ["Data may include identity, email, organization, role, projects, sites, measurements, references, requests and operational logs. The server may record request path, status and duration. Passwords are not written to request logs.", "Do not place unnecessary personal health information or secrets in measurement or message fields. The WEFEH Health domain is for project indicators and does not provide medical diagnosis."] },
        { title: "Access and sharing", paragraphs: ["Operational records are restricted by organization and user permissions. Offers and requests are not automatically published to a public marketplace. External sharing requires an appropriate purpose, basis and safeguards."] },
        { title: "Hosting and transfers outside Algeria", paragraphs: ["The actual hosting location depends on deployment configuration. Calling the platform sovereign does not mean data are automatically hosted in Algeria. Personal-data transfers must be assessed under applicable Algerian data-protection law and amendments."] },
        { title: "Retention and your rights", paragraphs: ["Retention periods must be set according to purpose and legal obligations. Erasure or anonymization should be applied when retention is no longer justified, subject to backups and legal requirements.", "Requests for access, correction, erasure, objection or restriction can be submitted through the workspace or Contact page. Recording a request does not mean it is automatically accepted."] },
        { title: "References", paragraphs: ["Algerian personal-data protection law and amendments:"], extra: privacyLawLinks },
      ],
    },
    terms: {
      title: "Terms of use",
      note: "Version: 2026-10-02 · Specific professional contracts and mandatory legal provisions take priority when applicable.",
      sections: [
        { title: "Service scope", paragraphs: ["FOGGARA organizes projects, measurements, reviews, WEFEH indicators, decisions and opportunities. Results depend on available data and rules; live connected systems must be distinguished from simulations and demo data."] },
        { title: "Accounts and permitted use", paragraphs: ["Use only an authorized account, protect credentials and provide only data you are entitled to use. Attempts to bypass organization isolation, upload malware, impersonate others or submit misleading data are prohibited."] },
        { title: "Review and responsibility", paragraphs: ["Indicators and recommendations are decision-support tools, not guarantees of production results, quality certificates, or medical or financial advice. Sources, units, freshness and methodology must be reviewed before decisions are adopted."] },
        { title: "Supply, demand and e-commerce", paragraphs: ["Matching suggests potential compatibility but does not automatically create a sales contract, invoice, payment or stock reservation. If e-commerce is enabled, applicable legal requirements must be implemented."], extra: ecommerceLawLink },
        { title: "Availability, changes and disputes", paragraphs: ["Access may be interrupted for maintenance, security or technical reasons. The interface does not create an unsigned service-level agreement. Disputes should first be addressed to the operator without waiving mandatory rights."] },
      ],
    },
    rights: {
      title: "Rights and intellectual property",
      sections: [
        { title: "Content and data", paragraphs: ["Data and content owners retain their rights. Submitting content permits the operator to process it only as needed to provide the service and according to applicable permissions; it does not transfer ownership."] },
        { title: "Name and software", paragraphs: ["FOGGARA and the SIREP OASIS NEXUS WEFEH identity identify the project and publisher. This page makes no claim of an unverified trademark, patent or certification. Software components remain subject to their respective licenses."] },
        { title: "Images and sources", paragraphs: ["Attribution for the Foggara in Tala image used in the interface:"], extra: imageAttribution },
        { title: "Reporting infringement", paragraphs: ["Send the content link, description of the right, evidence of standing and contact information through the Contact page. Reports are reviewed while limiting unnecessary disclosure of personal data."] },
      ],
    },
  },
};

const contactCopy: Record<Lang, {
  title: string;
  intro: string;
  back: string;
  location: string;
  direct: string;
  labels: { name: string; email: string; subject: string; message: string };
  consent: string;
  privacy: string;
  sending: string;
  send: string;
  saved: (reference: string) => string;
  failed: string;
}> = {
  ar: {
    title: "لنبنِ القيمة معًا.",
    intro: "مشروع ميداني، شراكة تقنية، خدمة هندسية أو طلب متعلق ببياناتك. تصل رسالتك إلى سجل التواصل الخاص بالمنصة.",
    back: "العودة إلى فقارة",
    location: "الجزائر · الأغواط",
    direct: "تواصل مباشر",
    labels: { name: "الاسم", email: "البريد الإلكتروني", subject: "الموضوع", message: "الرسالة" },
    consent: "أوافق على معالجة معلومات الرسالة للرد على طلبي وفق",
    privacy: "سياسة الخصوصية",
    sending: "جارٍ الحفظ…",
    send: "تسجيل الرسالة",
    saved: (reference) => `حُفظت الرسالة. مرجعك: ${reference}. لم تُرسل رسالة بريد تلقائية.`,
    failed: "تعذر حفظ الرسالة",
  },
  fr: {
    title: "Construisons de la valeur ensemble.",
    intro: "Projet terrain, partenariat technique, service d’ingénierie ou demande liée à vos données : votre message est enregistré dans le registre de contact de la plateforme.",
    back: "Retour à FOGGARA",
    location: "Algérie · Laghouat",
    direct: "Contact direct",
    labels: { name: "Nom", email: "E-mail", subject: "Objet", message: "Message" },
    consent: "J’accepte le traitement des informations du message afin de répondre à ma demande conformément à la",
    privacy: "politique de confidentialité",
    sending: "Enregistrement…",
    send: "Enregistrer le message",
    saved: (reference) => `Message enregistré. Référence : ${reference}. Aucun e-mail automatique n’a été envoyé.`,
    failed: "Impossible d’enregistrer le message",
  },
  en: {
    title: "Let’s build value together.",
    intro: "Field project, technical partnership, engineering service or a request about your data: your message is stored in the platform contact register.",
    back: "Back to FOGGARA",
    location: "Algeria · Laghouat",
    direct: "Direct contact",
    labels: { name: "Name", email: "Email", subject: "Subject", message: "Message" },
    consent: "I agree to processing the message information to respond to my request in accordance with the",
    privacy: "privacy policy",
    sending: "Saving…",
    send: "Save message",
    saved: (reference) => `Message saved. Reference: ${reference}. No automatic email was sent.`,
    failed: "Unable to save the message",
  },
};

export default function Legal() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const lang: Lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const pageKey = pathname.slice(1) as "about" | "privacy" | "terms" | "rights" | "contact";
  const contact = contactCopy[lang];
  const page = pageKey === "contact" ? null : pages[lang][pageKey];

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setReference("");
    try {
      const result = await api.post<{ reference: string }>("/operations/contact", {
        name: data.get("name"),
        email: data.get("email"),
        subject: data.get("subject"),
        message: data.get("message"),
        consent: data.get("consent") === "on",
        website: data.get("website") || "",
      });
      setReference(result.reference);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : contact.failed);
    } finally {
      setBusy(false);
    }
  }

  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const title = pageKey === "contact" ? contact.title : page?.title ?? "FOGGARA";

  return (
    <article className="fg-public fg-legal" dir={dir} lang={lang}>
      <Link to="/" className="fg-link"><BackIcon size={15} />{contact.back}</Link>
      <p className="fg-eyebrow">FOGGARA / SIREP OASIS NEXUS WEFEH</p>
      <h1>{title}</h1>

      {page ? (
        <>
          {page.note ? <p className="fg-note">{page.note}</p> : null}
          {page.intro ? <p>{page.intro}</p> : null}
          {page.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets?.length ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {section.extra ? <p className="fg-legal-links">{section.extra}</p> : null}
            </section>
          ))}
          {pageKey === "privacy" ? (
            <p className="fg-note">
              {lang === "ar" ? <>لطلب حقوق البيانات استخدم <Link to="/app/operations">مساحة العمل</Link> أو <Link to="/contact">التواصل</Link>.</>
                : lang === "fr" ? <>Pour exercer vos droits, utilisez <Link to="/app/operations">l’espace de travail</Link> ou la page <Link to="/contact">Contact</Link>.</>
                : <>To exercise data rights, use the <Link to="/app/operations">workspace</Link> or <Link to="/contact">Contact</Link>.</>}
            </p>
          ) : null}
          {pageKey === "rights" ? (
            <p className="fg-note">
              {lang === "ar" ? <>للإبلاغ عن انتهاك استخدم <Link to="/contact">اتصل بنا</Link>.</>
                : lang === "fr" ? <>Pour signaler une atteinte, utilisez la page <Link to="/contact">Contact</Link>.</>
                : <>To report an infringement, use the <Link to="/contact">Contact</Link> page.</>}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p>{contact.intro}</p>
          <div className="fg-contact-grid">
            <section>
              <h2>{contact.location}</h2>
              <p><MapPin size={17} />Cité 65 Villa El-Maamoura<br />03000 Laghouat, Algérie</p>
              <h2>{contact.direct}</h2>
              <p><Mail size={17} /><a href="mailto:kacimo2000@gmail.com">kacimo2000@gmail.com</a><br /><a href="mailto:skacimo1985@gmail.com">skacimo1985@gmail.com</a></p>
              <p><Phone size={17} /><a dir="ltr" href="tel:+213674005940">+213 674 005 940</a><br />WhatsApp: <a dir="ltr" href="https://wa.me/213556640211" target="_blank" rel="noreferrer">+213 556 640 211</a></p>
            </section>
            <form className="fg-panel" onSubmit={(event) => void submitContact(event)}>
              {([
                ["name", contact.labels.name, "text", 120],
                ["email", contact.labels.email, "email", 254],
                ["subject", contact.labels.subject, "text", 180],
              ] as const).map(([name, label, type, maxLength]) => (
                <label key={name} className="fg-field">
                  <span>{label}</span>
                  <input className="fg-input" name={name} type={type} required minLength={name === "name" ? 2 : 3} maxLength={maxLength} />
                </label>
              ))}
              <label className="fg-field"><span>{contact.labels.message}</span><textarea className="fg-input" name="message" required minLength={10} maxLength={5000} /></label>
              <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <label className="fg-checkbox">
                <input name="consent" type="checkbox" required />
                <span>{contact.consent} <Link to="/privacy">{contact.privacy}</Link>.</span>
              </label>
              <button className="fg-button" disabled={busy}><Send size={16} />{busy ? contact.sending : contact.send}</button>
              {reference ? <p role="status" className="fg-success">{contact.saved(reference)}</p> : null}
              {error ? <p role="alert" className="fg-alert">{error}</p> : null}
            </form>
          </div>
        </>
      )}
    </article>
  );
}
