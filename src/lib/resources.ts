/**
 * Help resources shown on /resources. Every number and link here was checked
 * against the organization's own site on 2026-11-15. Keep it that way: don't add
 * a line without reading the official page first.
 */
import type { Lang } from "./i18n";

type Text = Record<Lang, string>;

export type Resource = {
  name: Text;
  /** one sentence: who it's for / what you get */
  blurb: Text;
  /** tel: / sms: / https: actions, in order */
  actions: { label: Text; href: string }[];
  /** e.g. "24/7 · English & Spanish" */
  meta?: Text;
};

export type ResourceSection = { id: string; title: Text; intro?: Text; items: Resource[] };

export type Community = { name: string; blurb: Text; href: string };


const t = (en: string, es: string): Text => ({ en, es });

export const RESOURCE_SECTIONS: ResourceSection[] = [
  {
    id: "now",
    title: t("If you need someone right now", "Si necesitas a alguien ahora mismo"),
    intro: t("24/7, free, confidential.", "24/7, gratis, confidencial."),
    items: [
      {
        name: t("988 Suicide & Crisis Lifeline", "Línea 988 de Prevención del Suicidio y Crisis"),
        blurb: t(
          "Talk or text with a trained counselor about anything, including drug or alcohol use.",
          "Habla o escribe con un consejero capacitado sobre lo que sea, incluido el uso de drogas o alcohol.",
        ),
        actions: [
          { label: t("Call 988", "Llamar al 988"), href: "tel:988" },
          { label: t("Text 988", "Enviar texto al 988"), href: "sms:988" },
          { label: t("Chat online", "Chat en línea"), href: "https://chat.988lifeline.org/" },
        ],
        meta: t("24/7 · English & Spanish", "24/7 · Inglés y español"),
      },
      {
        name: t("Crisis Text Line", "Crisis Text Line"),
        blurb: t("Text with a counselor if talking is hard.", "Escribe con un consejero si hablar es difícil."),
        actions: [
          { label: t("Text HOME to 741741", "Envía HOLA al 741741"), href: "sms:741741" },
        ],
        meta: t("24/7 · text HOLA for Spanish", "24/7 · envía HOLA para español"),
      },
      {
        name: t("Wasatch Behavioral Health Receiving & Outreach Center", "Centro de Recepción y Alcance de Wasatch Behavioral Health"),
        blurb: t(
          "Walk in or call, any hour. 1175 East 300 North, Provo. Adults can stay up to 24 hours.",
          "Llega o llama a cualquier hora. 1175 East 300 North, Provo. Los adultos pueden quedarse hasta 24 horas.",
        ),
        actions: [
          { label: t("Call (801) 852-2131", "Llamar al (801) 852-2131"), href: "tel:+18018522131" },
          { label: t("Details", "Detalles"), href: "https://www.wasatch.org/crisis-services-at-wbh/" },
        ],
        meta: t("24/7 · Utah County", "24/7 · Condado de Utah"),
      },
    ],
  },
  {
    id: "overdose",
    title: t("Overdose", "Sobredosis"),
    intro: t(
      "If someone collapses, has a seizure, can't breathe, or won't wake up: call 911 first.",
      "Si alguien se desploma, convulsiona, no puede respirar o no despierta: llama primero al 911.",
    ),
    items: [
      {
        name: t("Utah Poison Control Center", "Centro de Control de Envenenamientos de Utah"),
        blurb: t("Immediate phone help for any poisoning or overdose question.", "Ayuda telefónica inmediata ante cualquier duda de envenenamiento o sobredosis."),
        actions: [{ label: t("Call 800-222-1222", "Llamar al 800-222-1222"), href: "tel:+18002221222" }],
        meta: t("24/7", "24/7"),
      },
      {
        name: t("Free naloxone (Narcan) kits", "Kits gratuitos de naloxona (Narcan)"),
        blurb: t(
          "Naloxone reverses an opioid overdose and is legal to carry in Utah. Many Utah libraries and fire stations hand out free kits, no questions asked.",
          "La naloxona revierte una sobredosis de opioides y es legal llevarla en Utah. Muchas bibliotecas y estaciones de bomberos de Utah dan kits gratis, sin preguntas.",
        ),
        actions: [
          { label: t("Where to get a kit", "Dónde conseguir un kit"), href: "https://www.utahnaloxone.org/utah-libraries-fire-stations-with-free-naloxone/" },
          { label: t("Utah Naloxone", "Utah Naloxone"), href: "https://utahnaloxone.org/" },
          { label: t("Stop the Opidemic (Utah DHHS)", "Stop the Opidemic (DHHS de Utah)"), href: "https://opidemic.utah.gov/naloxone/naloxone-free/" },
        ],
      },
    ],
  },
  {
    id: "help",
    title: t("Help with drugs or alcohol", "Ayuda con drogas o alcohol"),
    intro: t("Asking is not a violation of anything.", "Pedir ayuda no viola nada."),
    items: [
      {
        name: t("SAMHSA National Helpline", "Línea Nacional de Ayuda de SAMHSA"),
        blurb: t(
          "Free referrals to local treatment, support groups, and community help for drug, alcohol, or mental health concerns.",
          "Referencias gratuitas a tratamiento local, grupos de apoyo y ayuda comunitaria para problemas de drogas, alcohol o salud mental.",
        ),
        actions: [{ label: t("Call 1-800-662-4357", "Llamar al 1-800-662-4357"), href: "tel:+18006624357" }],
        meta: t("24/7 · English & Spanish", "24/7 · Inglés y español"),
      },
      {
        name: t("Wasatch Behavioral Health substance use services", "Servicios de uso de sustancias de Wasatch Behavioral Health"),
        blurb: t(
          "Utah County's public provider: outpatient treatment, the Center for Opiate Recovery, residential and detox programs, and drug court support.",
          "El proveedor público del Condado de Utah: tratamiento ambulatorio, el Centro de Recuperación de Opiáceos, programas residenciales y de desintoxicación, y apoyo en la corte de drogas.",
        ),
        actions: [
          { label: t("Call (801) 373-4760", "Llamar al (801) 373-4760"), href: "tel:+18013734760" },
          { label: t("wasatch.org", "wasatch.org"), href: "https://www.wasatch.org/" },
        ],
        meta: t("Mon–Fri 8 am–5 pm", "Lun–Vie 8 am–5 pm"),
      },
      {
        name: t("Alcoholics Anonymous", "Alcohólicos Anónimos"),
        blurb: t("Free peer meetings for anyone who wants to stop drinking. Daily meetings across Utah County.", "Reuniones gratuitas entre pares para quien quiera dejar de beber. Reuniones diarias en el Condado de Utah."),
        actions: [{ label: t("Find a meeting", "Buscar una reunión"), href: "https://www.aa.org/find-aa" }],
        meta: t("Meetings in English & Spanish", "Reuniones en inglés y español"),
      },
      {
        name: t("Narcotics Anonymous", "Narcóticos Anónimos"),
        blurb: t("Free peer meetings for any drug problem, in person and online.", "Reuniones gratuitas entre pares para cualquier problema con drogas, en persona y en línea."),
        actions: [
          { label: t("Find a meeting", "Buscar una reunión"), href: "https://na.org/meetingsearch/find-na/" },
          { label: t("Online meetings", "Reuniones en línea"), href: "https://na.org/meetingsearch/virtual-meeting-search/" },
        ],
      },
      {
        name: t("For family and friends", "Para familiares y amigos"),
        blurb: t(
          "Al-Anon and Nar-Anon are free groups for people affected by someone else's drinking or drug use.",
          "Al-Anon y Nar-Anon son grupos gratuitos para personas afectadas por la bebida o el uso de drogas de otra persona.",
        ),
        actions: [
          { label: t("Al-Anon", "Al-Anon"), href: "https://al-anon.org/" },
          { label: t("Nar-Anon", "Nar-Anon"), href: "https://www.nar-anon.org/" },
        ],
      },
    ],
  },
  {
    id: "prevention",
    title: t("Suicide prevention", "Prevención del suicidio"),
    items: [
      {
        name: t("Live On Utah", "Live On Utah"),
        blurb: t("Utah's suicide-prevention resources, including a Spanish-language guide.", "Recursos de prevención del suicidio de Utah, incluida una guía en español."),
        actions: [
          { label: t("liveonutah.org", "liveonutah.org"), href: "https://liveonutah.org/" },
          { label: t("Guía en español", "Guía en español"), href: "https://liveonutah.org/guia-para-prevencion-del-suicidio/" },
        ],
      },
      {
        name: t("SafeUT", "SafeUT"),
        blurb: t("24/7 crisis chat for Utah students and teens, run by University of Utah Health.", "Chat de crisis 24/7 para estudiantes y adolescentes de Utah, operado por University of Utah Health."),
        actions: [{ label: t("safeut.org", "safeut.org"), href: "https://safeut.org/" }],
        meta: t("For students", "Para estudiantes"),
      },
    ],
  },
];

/** Peer communities on Reddit. Shown as a compact list under "Online communities". */
export const COMMUNITIES: Community[] = [
  { name: "r/stopdrinking", blurb: t("Quitting or cutting back on alcohol. Daily check-ins, no judgment.", "Dejar o reducir el alcohol. Registros diarios, sin juicios."), href: "https://www.reddit.com/r/stopdrinking/" },
  { name: "r/REDDITORSINRECOVERY", blurb: t("Recovery from any substance.", "Recuperación de cualquier sustancia."), href: "https://www.reddit.com/r/REDDITORSINRECOVERY/" },
  { name: "r/leaves", blurb: t("Quitting cannabis.", "Dejar el cannabis."), href: "https://www.reddit.com/r/leaves/" },
  { name: "r/OpiatesRecovery", blurb: t("Opioid recovery, including on Suboxone or methadone.", "Recuperación de opioides, incluso con Suboxone o metadona."), href: "https://www.reddit.com/r/OpiatesRecovery/" },
  { name: "r/StopSpeeding", blurb: t("Quitting meth and other stimulants.", "Dejar la metanfetamina y otros estimulantes."), href: "https://www.reddit.com/r/StopSpeeding/" },
  { name: "r/SuicideWatch", blurb: t("Peer support from people who've been there. Not a crisis line: call 988 first.", "Apoyo entre pares de personas que han pasado por lo mismo. No es una línea de crisis: llama primero al 988."), href: "https://www.reddit.com/r/SuicideWatch/" },
];
