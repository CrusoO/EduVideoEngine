# planner.v2

## TASK
Plan one short maths lesson from the records in INPUT: choose its beats, their order, how long each lasts and one scene pattern for each. (Pass: planner. Prompt version: planner.v2.)

## RULES
1. INPUT.template is already decided. Copy it into the reply.
2. Use between INPUT.limits.beats.min and INPUT.limits.beats.max beats. Number them b1, b2, and so on, in order.
3. Each beat has one durationS in whole seconds, at most INPUT.limits.beatMaxSeconds. The durations together must not pass INPUT.limits.lessonHardMaxSeconds and should stay near or under INPUT.limits.lessonTargetSeconds. A beat with an equation, a graph and a number line needs more time than a beat with one equation.
4. Each beat uses exactly one pattern from INPUT.patterns, and the beat kind must be one of that pattern's kinds. Use only patterns that appear in INPUT.patterns.
5. Each beat's sourceIds must list every record id named in its pattern's sources, and may list other records of INPUT.records the beat draws on. Every beat has at least one source.
6. A worked beat must use a pattern whose kinds include worked, and must have pause set to true.
7. Set pause to true only for a pattern whose pause is required or optional. A pattern whose pause is required must have pause true.
8. Include at least one worked beat.
9. If INPUT.template is problem-first, the first beat has kind predict. If it is example-first, the first beat does not have kind predict.
10. Order the beats so each prepares the next: pose or show, then explain, then work through, then check or warn about a common mistake. Do not repeat a beat that adds nothing.
11. Titles are plain words, at most 60 characters, with no mathematics.

## ERROR OBJECTS
- when the records cannot support the lesson (for example there is no stored solution, or no pattern can be filled): {"error":"insufficient_content","missing":["<what is missing, in plain words>"]}
- when INPUT.locale is not en: {"error":"unsupported_locale"}

## EXAMPLE
input: {"skillId":"S.EX","locale":"en","template":"example-first","limits":{"beats":{"min":1,"max":2},"beatMaxSeconds":30,"lessonTargetSeconds":40,"lessonHardMaxSeconds":60},"records":[{"id":"r.one","kind":"solutionSteps","text":"Solve it."}],"patterns":[{"id":"p.one","kinds":["worked"],"pause":"required","minSentences":2,"sources":["r.one"]}]}
output: {"template":"example-first","beats":[{"id":"b1","kind":"worked","title":"Work an example","pattern":"p.one","durationS":20,"pause":true,"animate":true,"sourceIds":["r.one"]}]}
