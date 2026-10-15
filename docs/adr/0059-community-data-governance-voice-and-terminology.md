# ADR 0059: Community data governance for voice and terminology data

Status: proposed (owner decision pending; written with the vision alignment task, 2026-10-16).

## Context
The direction in ADR 0058 requires recording adult community speakers saying terms and sentences in local languages, and building a terminology commons for those communities. This data has provenance, ownership and consent implications that differ from the engine's current data model (developer-authored content, synthetic voices).

## Decision
Record the following as the proposed governance model for voice and terminology data. The owner confirms or amends this before any recording takes place.

**Consent**
- A consent screen is shown before the first recording of any session. It states: the language being recorded, the permitted uses (lessons for children in this community; the community terminology list), the right to withdraw, and a contact line for withdrawal requests.
- Consent is recorded: the consent version, the date and the speaker code are stored in the export manifest alongside the recordings.
- Only adult speakers are recorded for lesson content. Children's voices are never recorded or used in lesson audio. A clear warning and adult confirmation appear in any recording tool.

**Ownership and licence**
- The community retains ownership of its terminology and voices. The engine licence for community data is decided by the community and the owner together before the first recording session and recorded in the export manifest.
- The default until that decision: the data may be used only for lessons produced for that community and for the community's own terminology list. No redistribution and no use outside that scope without the community's written consent.
- The right to withdraw applies to individual speaker contributions. A speaker may request removal of their recordings; the owner removes them from the engine within 30 days. Lessons already distributed with that voice are flagged for re-narration.

**Who approves**
- A named community representative approves the terminology list for each language before it is used in lessons.
- Voice recordings are approved per sentence by the recording coordinator and, for lesson use, by a named maths-content reviewer who is a speaker of the language.

**No recordings of children's voices in lesson content**
- This is an absolute rule. No lesson audio uses a child's voice. Teacher voices and adult community speaker voices are permitted with a signed release.

**Provenance record in the export manifest**
- Each exported audio file carries: language, script, dialect, speaker code, consent version and date, item id, text, duration, recordedAt, and the device's user-agent string. No personal name is stored unless the speaker explicitly agreed.

## Consequences
- A recording tool must implement this consent and provenance model before any field recording.
- The engine's file-first voice adapter accepts recordings exported from a compliant tool by matching hashes and durations in the manifest.
- `docs/SECURITY.md` has a matching section for community data.

## Revisit triggers
- A community requests a different ownership or licence model.
- Legal advice on the jurisdiction (Nepal or India) changes the consent requirements.
- The engine gains a live voice model: then community voice data may not be used for training without explicit per-speaker consent for that purpose.
