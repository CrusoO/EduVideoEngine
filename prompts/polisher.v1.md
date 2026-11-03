# polisher.v1

## TASK
Rewrite the draft narration of ONE beat of a maths lesson so that it sounds like a patient teacher speaking aloud. Keep every fact, placeholder and number of the draft; change only the wording. (Pass: polisher. Prompt version: polisher.v1.)

## RULES
1. Write exactly one entry in beats, for INPUT.beat.beatId, with one sentence for each sentence of INPUT.beat.draft, numbered n as in the draft. When INPUT.beat.redo is present, answer only for the sentences it lists.
2. Keep the meaning of each sentence. Do not add a fact, a step, an example, a number or a rule that is not in the draft or in INPUT.beat.claims. A sentence you cannot improve stays exactly as it is: copying the draft sentence is always a correct answer.
3. Keep every placeholder of a draft sentence, for example {expr:some.id}, in the rewritten sentence, and add none. The system speaks a placeholder aloud, so do not say the same formula again in words.
4. Never write a digit, a symbol or mathematical notation. A number may be said as a word only if the draft sentence already says it or it is in that claim's numbers. Do not count things with number words.
5. A sentence has at most INPUT.limits.sentenceWords words and is one sentence. A sentence marked filler states nothing: replace it with a short sentence that helps the student follow the claims (what to look at, what to notice, why it matters in plain words), or keep it.
6. Speak to one student. When the claim allows it, say what happens in the picture or the example before you name the rule. Say one idea in a sentence.
7. Begin no two sentences in a row with the same word. Use no stock phrase such as "as we can see", "it is important to note" or "let us now". Say an idea once, then say why it is so; do not say it twice in the same words.
8. INPUT.previousSentences are the last sentences the student has just heard. Continue from them; do not repeat, recap or contradict them. When it is empty, this is the first beat.
9. The sentences of a core claim together keep at least INPUT.minWordsForCoreClaim words. A placeholder counts as one word.
10. You may give a better title (a few words, no digit), learningGoal (a question of at most INPUT.limits.goalWords words, no digit, no notation), prompt (at most INPUT.limits.promptChars characters, no digit, no notation) and note (at most INPUT.limits.noteWords words, no digit, no placeholder), only for those INPUT.beat shows. Leave a field out to keep the current one.
11. When INPUT.beat.redo is present, each entry names the sentence, the problems found in your earlier try, and that try. Fix every problem and change nothing else.

## ERROR OBJECTS
- when a sentence or an id the task needs is not in INPUT (an id that is not in ALLOWED VALUES): {"error":"unknown_id","id":"<the id or description that was needed>"}
- when the draft cannot be rewritten from what INPUT gives: {"error":"insufficient_content","missing":["<what is missing, in plain words>"]}
- when INPUT.locale is not en: {"error":"unsupported_locale"}

## EXAMPLE
input: {"skillId":"S.EX","locale":"en","level":"class-10","limits":{"sentenceWords":24,"promptChars":120,"noteWords":10,"goalWords":18},"minWordsForCoreClaim":24,"previousSentences":["Start with any number and double it."],"beat":{"beatId":"b2","title":"The idea","learningGoal":"What is the idea that makes this work?","pattern":"p.card","claims":[{"id":"r.claim","importance":"core","numbers":[]}],"draft":[{"n":1,"claimId":"r.claim","filler":false,"text":"Doubling and halving undo each other, whatever the number is."},{"n":2,"claimId":"r.claim","filler":true,"text":"Take a moment to let that sink in."},{"n":3,"claimId":"r.claim","filler":true,"text":"Say it in your own words, and it will stay with you."}],"note":"Doubling and halving undo each other"}}
output: {"beats":[{"beatId":"b2","learningGoal":"Why do doubling and halving undo each other?","sentences":[{"n":1,"text":"You ended up where you began, and that is no accident: doubling and halving undo each other."},{"n":2,"text":"Halving takes away exactly what doubling added, whatever the number is."},{"n":3,"text":"Try it with a tiny number and a huge one, and watch the same thing happen."}]}]}
