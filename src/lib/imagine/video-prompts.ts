import type { AspectRatio, VideoDuration } from "./types";

export const VIDEO_PROMPT_CATEGORIES = [
  { id: "camara", label: "Cámara" },
  { id: "costa", label: "Costa" },
  { id: "ciudad", label: "Ciudad" },
  { id: "retrato", label: "Retrato" },
  { id: "noche", label: "Noche" },
  { id: "archivo", label: "Archivo" },
] as const;

export type VideoPromptCategory = (typeof VIDEO_PROMPT_CATEGORIES)[number]["id"];

export type VideoPromptCard = {
  id: string;
  category: VideoPromptCategory;
  title: string;
  move: string;
  prompt: string;
  aspect: AspectRatio;
  duration: VideoDuration;
  featured?: boolean;
};

export const VIDEO_PROMPTS: VideoPromptCard[] = [
  {
    id: "push-faro",
    category: "costa",
    title: "Faro en la bruma",
    move: "Push-in lento",
    featured: true,
    aspect: "16:9",
    duration: 10,
    prompt:
      "Faro de hormigón al borde del Cantábrico, niebla baja. La cámara avanza despacio hacia el haz giratorio; el mar respira al fondo, gotas en el lente, 35 mm anamórfico.",
  },
  {
    id: "pan-olas",
    category: "costa",
    title: "Ola que rompe",
    move: "Panorámica",
    aspect: "16:9",
    duration: 6,
    prompt:
      "Playa de arena oscura al amanecer. Panorámica horizontal siguiendo una ola que rompe; espuma, luz rasante y un solo pájaro cruzando el encuadre, 50 mm.",
  },
  {
    id: "tilt-acantilado",
    category: "costa",
    title: "Acantilado",
    move: "Tilt arriba",
    aspect: "9:16",
    duration: 6,
    prompt:
      "Desde las rocas mojadas, tilt ascendente por un acantilado cubierto de musgo hasta el cielo de hora azul. Viento, salitre, ningún texto, 24 mm.",
  },
  {
    id: "orbit-coche",
    category: "camara",
    title: "Órbita",
    move: "Travelling circular",
    featured: true,
    aspect: "16:9",
    duration: 10,
    prompt:
      "Coche clásico parado en un descampado al atardecer. La cámara lo orbita despacio a la altura del capó; polvo en el aire, cromados, sol bajo, 40 mm.",
  },
  {
    id: "handheld-pasillo",
    category: "camara",
    title: "Pasillo",
    move: "Cámara al hombro",
    aspect: "16:9",
    duration: 6,
    prompt:
      "Pasillo de un hotel vacío, luces cálidas. Cámara al hombro avanzando; una puerta se cierra al fondo, respiración leve, grano, 32 mm.",
  },
  {
    id: "crane-plaza",
    category: "camara",
    title: "Grúa",
    move: "Descenso en grúa",
    aspect: "16:9",
    duration: 15,
    prompt:
      "Plaza mojada después de la lluvia. La cámara desciende desde los tejados hasta un charco que refleja un campanario; alguien cruza con paraguas, 24 mm.",
  },
  {
    id: "lluvia-neon",
    category: "ciudad",
    title: "Asfalto",
    move: "Dolly lateral",
    featured: true,
    aspect: "16:9",
    duration: 10,
    prompt:
      "Calle estrecha de noche, lluvia y neón rojo en el asfalto. Dolly lateral a la altura del bordillo; un autobús pasa, reflejos, vapor, 35 mm.",
  },
  {
    id: "metro",
    category: "ciudad",
    title: "Andén",
    move: "Fijo, sujeto en movimiento",
    aspect: "16:9",
    duration: 6,
    prompt:
      "Andén de metro vacío. Cámara fija; el tren entra, luces parpadean, el viento mueve un periódico en el banco. Plano medio, 50 mm.",
  },
  {
    id: "azotea",
    category: "ciudad",
    title: "Azotea",
    move: "Panorámica lenta",
    aspect: "16:9",
    duration: 10,
    prompt:
      "Azotea al atardecer sobre una ciudad densa. Panorámica lenta de chimeneas a un horizonte naranja; antenas, palomas, humo lejano, 28 mm.",
  },
  {
    id: "mirada",
    category: "retrato",
    title: "Mirada",
    move: "Push-in al rostro",
    featured: true,
    aspect: "4:3",
    duration: 6,
    prompt:
      "Retrato de una persona junto a una ventana. Push-in muy lento hacia los ojos; luz de tarde, polvo en el aire, parpadeo, 85 mm.",
  },
  {
    id: "baile",
    category: "retrato",
    title: "Ensayo",
    move: "Travelling paralelo",
    aspect: "16:9",
    duration: 10,
    prompt:
      "Bailarina ensayando en un estudio vacío. Travelling paralelo a su paso; una sola lámpara cálida, suelo de madera, respiración, 50 mm.",
  },
  {
    id: "manos",
    category: "retrato",
    title: "Manos",
    move: "Plano detalle",
    aspect: "1:1",
    duration: 6,
    prompt:
      "Primer plano de manos amasando barro en un taller. La cámara se acerca a la textura; agua, huellas, luz de norte, 90 mm macro.",
  },
  {
    id: "bosque",
    category: "noche",
    title: "Hayedo",
    move: "Avance entre árboles",
    aspect: "16:9",
    duration: 10,
    prompt:
      "Hayedo de noche después de la lluvia. La cámara avanza entre troncos; una linterna lejana, musgo húmedo, silencio, 24 mm.",
  },
  {
    id: "cocina",
    category: "noche",
    title: "Cocina a las 3",
    move: "Pan a la ventana",
    aspect: "16:9",
    duration: 6,
    prompt:
      "Cocina vacía a las tres de la mañana. Panorámica desde el fregadero hasta el cristal con neón rojo de la calle; nevera zumba, 35 mm.",
  },
  {
    id: "tunel",
    category: "noche",
    title: "Túnel",
    move: "Hacia la luz",
    aspect: "16:9",
    duration: 10,
    prompt:
      "Interior de un túnel de carretera de noche. La cámara avanza hacia la boca; luces de un coche lejano, hormigón manchado, 28 mm anamórfico.",
  },
  {
    id: "super8",
    category: "archivo",
    title: "Super 8",
    move: "Zoom óptico",
    aspect: "4:3",
    duration: 10,
    prompt:
      "Metraje estilo Super 8 de una familia en la playa, años 70. Zoom óptico torpe hacia un niño que corre; velado, parpadeo, grano grueso, luz de mediodía.",
  },
  {
    id: "vhs",
    category: "archivo",
    title: "Cinta VHS",
    move: "Fijo inestable",
    aspect: "4:3",
    duration: 6,
    prompt:
      "Interior doméstico grabado en VHS: un televisor encendido de madrugada. Cámara un poco inestable, tracking lines, color corrido, 40 mm.",
  },
  {
    id: "foto-viva",
    category: "archivo",
    title: "Retrato que respira",
    move: "Ken Burns lento",
    aspect: "3:4",
    duration: 6,
    prompt:
      "Retrato de estudio de los años 50 que cobra un soplo de vida: el sujeto parpadea y el polvo se mueve. Recorrido lento sobre la placa, 85 mm.",
  },
];

export function featuredVideoPrompts(): VideoPromptCard[] {
  return VIDEO_PROMPTS.filter((p) => p.featured).slice(0, 4);
}

export function videoPromptsIn(category: VideoPromptCategory): VideoPromptCard[] {
  return VIDEO_PROMPTS.filter((p) => p.category === category);
}
