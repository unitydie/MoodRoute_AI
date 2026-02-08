Nettside: https://moodrouteai-production.up.railway.app/

# MoodRoute AI - Kort teknisk dokumentasjon

## Hvordan fungerer lagringen?
Prosjektet bruker PostgreSQL i Railway. Ved oppstart kjorer backend `db/init.sql` og oppretter tabeller hvis de ikke finnes:
- `users` (kontoer)
- `sessions` (innloggingssesjoner)
- `conversations` (chat-prosjekter per bruker)
- `messages` (meldinger i hver samtale)
- `user_profiles` (presetter og besokte steder)

Data er knyttet til bruker-ID, sa hver bruker ser kun egne samtaler.  
Historikk hentes ved sideoppdatering via API og vises i chat-sidebaren.  
Nar en chat slettes/cleares, fjernes meldinger i databasen for den samtalen.

## Hvordan kobles frontend <-> backend?
Frontend er laget i vanilla HTML/CSS/JS (`public/assets/*.js`) og snakker med Express-backend via `fetch` mot `/api/*`.

Hovedflyt:
1. Frontend sender brukertekst (og eventuelt bilde-URL fra opplasting) til `POST /api/chat`.
2. Backend bygger prompt med systeminstruksjoner + brukerhistorikk + (om mulig) bykontekst.
3. Backend kaller OpenAI naar `OPENAI_API_KEY` finnes, ellers mock-modus.
4. Svaret lagres gjennom `POST /api/conversations/:id/messages`.
5. Frontend oppdaterer meldingslisten og samtalelisten fra API.

Autentisering skjer med HttpOnly-cookie og API-endepunkter for login/register/GitHub OAuth.

## Hva ville du gjort hvis du hadde mer tid?
1. Legge til ordentlige migrasjoner (for eksempel med versjonstabell og rollback-stotte).
2. Forbedre observability: strukturert logging, metrics, og tydelig feildiagnose i UI.
3. Bedre testdekning (API-integrasjonstester for auth, chat, lagring og filopplasting).
4. Utvide bykunnskap med dynamiske kilder (kart/POI-API) i tillegg til statisk kunnskapsfil.
5. Legge til rollebasert admin-side for enkel visning av databaseinnhold i appen.
