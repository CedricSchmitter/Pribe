/** Topic roulette on `/submit` (D26). Order matters: the wheel and the stored index use it. */
export const TOPICS = [
  'Präsentation über ein Hobby',
  'Präsentation über ein nischiges Wissen',
  'Präsentation über den exotischsten Urlaub',
  'Ein Gegenstand, der mir viel bedeutet – und die Geschichte dahinter',
  'Mein Lieblingsbuch, -film oder -serie – und warum alle sie kennen sollten',
  'Ein Lifehack oder Werkzeug, das mein Leben verbessert hat',
  'Meine Heimat/Region – drei Dinge, die man dort gesehen oder gegessen haben muss',
  'Ein Fail oder Missgeschick – und was ich daraus gelernt habe',
  'Mein Lieblingsessen – inklusive Rezept oder Geschichte dazu',
  'Ein Job, den ich nie hatte, aber gerne mal ausprobieren würde',
  'Eine Person, die mich inspiriert',
  'Ein „Hot Take“ – eine harmlose, aber kontroverse Meinung und Argumente dafür',
  'Wie sieht mein perfekter Sonntag aus?',
  'Eine Erfindung oder Technologie, die ich unterschätzt finde',
  'Mein erstes Auto / Fahrrad / Handy – eine Zeitreise',
  'Etwas, das ich mir selbst beigebracht habe',
  'Mein Bucket-List-Ziel und wie ich es erreichen will',
  'Ein Mythos, der nicht stimmt (Faktencheck-Style)',
] as const;

/** Given once all `TOPICS` are taken; the pool is never refilled. */
export const FREE_TOPIC_TITLE = 'Freies Thema';

export function topicTitle(index: number | null): string {
  return index === null ? FREE_TOPIC_TITLE : (TOPICS[index] ?? FREE_TOPIC_TITLE);
}
