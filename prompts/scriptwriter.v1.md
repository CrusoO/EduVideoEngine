# scriptwriter.v1

## TASK
Write the narration of a planned maths lesson: for each beat in INPUT.beats, the spoken sentences that state its claims, and the short texts its scene asks for. The system adds the goal sentence, the question and the scenes. (Pass: scriptwriter. Prompt version: scriptwriter.v1.)

## RULES
1. Write one entry in beats for every beat in INPUT.beats, using its beatId. Write no other beat.
2. Give every claim of a beat at least one sentence, and say each claim in the order INPUT lists them. A sentence says one claim: set its claimId to that claim's id. A claim is said after every claim in its dependsOn.
3. Say what the claim says, in plain spoken English for a student of INPUT.level, in short sentences of at most INPUT.limits.sentenceWords words. The says field is what the claim states; put it in your own words, the way a teacher speaks, and do not copy it word for word. Do not add a fact, a step, an example or a rule that is not in INPUT.
4. A claim whose importance is core needs enough speech to be heard: all its sentences together have at least INPUT.minWordsForCoreClaim words. A placeholder counts as one word. Say the same idea in a second way, or say why it matters, but do not repeat a sentence.
5. Never write a digit, a symbol or mathematical notation in a sentence. Where a formula belongs write its placeholder, for example {expr:some.id}, using only ids from that claim's placeholders. The system speaks a placeholder aloud, so do not say the same formula again in words.
6. A number may be spoken as a word only if it is in that claim's numbers. Write it as a word, never as a digit. Do not say any other number, and do not count things with number words (for example "both" is fine, "three steps" is not unless three is in the claim's numbers).
7. You may add one link sentence to a beat. It joins two claims of that beat when one of them lists the other in dependsOn, comes after the sentences of both, and uses no placeholder. Write it as an entry with linkClaimIds (the two claim ids) and text.
8. When a beat has a question, the system asks it first, and the answer follows. Your first sentence of that beat states the answer, using the placeholder of the answer claim. Do not repeat the question.
9. When INPUT says a beat writes a prompt, give prompt: one short question for the student to think about while the lesson waits, at most INPUT.limits.promptChars characters, with no digit, no notation and no placeholder. When it says a beat writes a note, give note: the fact in a few words, at most INPUT.limits.noteWords words, with no digit and no placeholder. Give neither when INPUT does not ask.
10. Do not write the goal sentence, a transition or a title. Do not mention beats, slides, claims or the lesson itself.

## ERROR OBJECTS
- when a claim, a beat or an expression the task needs is not in INPUT (an id that is not in ALLOWED VALUES): {"error":"unknown_id","id":"<the id or description that was needed>"}
- when a claim cannot be said from what INPUT gives: {"error":"insufficient_content","missing":["<what is missing, in plain words>"]}
- when INPUT.locale is not en: {"error":"unsupported_locale"}

## EXAMPLE
input: {"skillId":"S.EX","locale":"en","level":"class-10","limits":{"sentenceWords":24,"promptChars":120,"noteWords":10},"minWordsForCoreClaim":24,"beats":[{"beatId":"b1","title":"The idea","learningGoal":"What is the idea we use here?","pattern":"p.card","claims":[{"id":"r.claim","importance":"core","dependsOn":[],"says":"Doubling a number and then halving it gives the number back.","placeholders":{},"numbers":[]}],"writes":{"prompt":false,"note":true}}]}
output: {"beats":[{"beatId":"b1","note":"Double, then halve","sentences":[{"claimId":"r.claim","text":"Start with any number and double it."},{"claimId":"r.claim","text":"Now halve what you have, and you are back at the number you started with."},{"claimId":"r.claim","text":"So doubling and halving undo each other, whatever the number is."}]}]}
