# ORB Body Lab

Custom visual/body frontend for The Attention Reset Companion.

## Architecture

- ElevenLabs = brain, voice, conversation engine, ASR/TTS, knowledge, behavior
- GitHub = source of truth and implementation bridge
- Custom frontend = ORB body: visual presence, interaction, animation, state, microphone interaction, audio visualization
- Attention Reset = environment/context
- User = actual point of the system

ORB is not a generic AI assistant, therapist, life coach, productivity coach, or identity profiler.

Core intervention: INTERRUPT -> STABILIZE -> ROUTE -> ACT

## First build

RESTING -> CONNECTING -> LISTENING <-> THINKING -> SPEAKING -> RETURNING -> RESTING

The first question is simple: can ORB feel alive while the real ElevenLabs conversation happens behind it?

The canonical visual is a breathing light with borders. Avoid generic AI spheres, chatbot bubbles, dashboards, cyberpunk UI, and unnecessary controls.

## ElevenLabs boundary

Current agent: ORB 9/17
Agent ID: agent_1501kw5m24g5fqz9k547ztzen171
Voice ID: 1O8grLTvxBlxHXud2CZq
LLM: gpt-5.4-mini
TTS: eleven_v3_conversational
ASR: Scribe Realtime
Knowledge base: The Attention Reset

The prototype uses the public agent ID because the current agent is configured without client authentication. No API key belongs in the browser.

Production authentication should use ElevenLabs server-side session/signed connection mechanisms if the agent becomes private.

## Constraints

Keep the first build deliberately small. No accounts, database, analytics, conversation history, settings panels, or unnecessary backend services.

GitHub is the current source-of-truth path. We remain open to a visual/full-stack builder if it is genuinely better and the user is not blocked by exhausted credits/allowances.
