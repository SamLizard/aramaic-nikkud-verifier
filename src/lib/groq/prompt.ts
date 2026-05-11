import type { WordEntry } from "../../types";

export const generatePrompt = (entry: WordEntry): string => {
  const dict = entry.dictionary;
  const ctx = (entry.gemara_pages || [])
    .flatMap((page) =>
      (page.occurrences || []).map((occ, i) => {
        const b = (occ.gemara?.before || []).slice(-4).join(" ");
        const a = (occ.gemara?.after || []).slice(0, 4).join(" ");
        const w = occ.gemara?.word || "";
        const s = occ.steinsaltz?.full_context
          ? ` [Steinsaltz: ${(occ.steinsaltz.full_context || "").slice(0, 80)}]`
          : "";
        return `  • ${page.label} occ.${i + 1}: ${b} 【${w}】 ${a}${s}`;
      })
    )
    .join("\n");

  return `Tu es un expert en araméen du Talmud babylonien.

Ta tâche est UNIQUEMENT de vérifier la vocalisation (nikkud) d'une forme déjà écrite.

Données :
  Mot étudiant : "${entry.word_with_nikkud}"
  Forme sans nikkud à préserver : "${entry.base_consonants}"
  Sens visé (fr) : "${entry.french_meaning}"
  Dictionnaire : ${dict?.meaning || "N/A"}
  Suggestions : ${(dict?.suggestions || []).slice(0, 4).join(", ")}
  Entrée avec ellipse : ${entry.is_ellipsis_entry ? "oui" : "non"}

Règles impératives :
1. Le texte araméen doit rester le même. Tu peux modifier seulement le nikkud, le dagesh, le shva et les autres signes de vocalisation.
2. Tu ne dois jamais ajouter, supprimer, remplacer ou déplacer une lettre consonantique.
3. Tu ne dois jamais supprimer ou réécrire une partie de l'expression. Si l'entrée contient plusieurs mots, ו, tirets, maqaf, points de suspension, etc., tout cela doit rester présent exactement dans la correction.
4. Ne remplace jamais l'expression par un lemme, une forme plus courte, une forme canonique ou un synonyme.
5. Le bon choix est celui qui correspond au sens français visé. Les sources ci-dessous servent seulement de preuves pour vérifier l'usage réel du même mot dans la Guemara.
6. Si les sources montrent un autre mot ou un autre sens, ne force pas cette autre forme.
7. "corrected_nikkud_word" doit être soit la forme complète corrigée avec exactement le même texte de base, soit "-".
8. "pages_same_meaning" ne doit contenir que les labels des pages où le mot correspond bien au sens français visé.

Contextes Guemara :
${ctx || "  (aucun contexte disponible)"}

Procédure :
- Compare la forme étudiante au sens visé.
- Utilise les contextes seulement pour vérifier si cette même forme araméenne, avec ce sens, apparaît avec un nikkud déterminé.
- Si la vocalisation étudiante est correcte pour ce sens, mets "nikkud_correct": true et "corrected_nikkud_word": "-".
- Si la vocalisation est incorrecte, propose la forme complète corrigée en conservant exactement les mêmes consonnes et la même ponctuation.

Réponds UNIQUEMENT avec cet objet JSON (sans backticks ni texte autour) :
{"nikkud_correct":boolean,"corrected_nikkud_word":"mot corrigé ou -","notes":"explication grammaticale courte en français","pages_same_meaning":["label1","..."]}`;
};

export const generateFallbackPrompt = (entry: WordEntry): string =>
  `${generatePrompt(entry)}

IMPORTANT SUPPLÉMENTAIRE :
- Réponds avec du JSON valide uniquement.
- Aucune phrase avant ou après le JSON.
- Si tu n'es pas sûr, renvoie quand même l'objet JSON demandé.`;
