# ⚡ Kipinä – oma Tesla-kojelauta ja kauko-ohjain

Kipinä on selaimessa toimiva Tesla-sovellus, joka pyörii ilmaiseksi **GitHub Pagesissa**.
Se puhuu suoraan Teslan virallisen **Fleet API:n** kanssa, ja komennot allekirjoitetaan omalla
avaimellasi Teslan **Vehicle Command Protocolilla**, kuten uudet autot vaativat. Palvelinta ei tarvita.

> Kokeile heti: avaa sivu ja valitse **Kokeile demoa**. Demo käyttää simuloitua autoa.

## Ominaisuudet

| Osio | Mitä voi tehdä |
|---|---|
| **Koti** | Auto ylhäältä päin (ovet, luukut, ikkunat, latausluukku ja rengaspaineet), akku- ja toimintamatkarengas, pikatoiminnot, media ja sijainti |
| **Ilmasto** | Ilmastointi päälle ja pois, lämpötila, istuinlämmitys (myös takana), istuintuuletus, rattilämmitys, automaattinen istuin- ja rattilämmitys, max-sulatus, pidä päällä- / koira- / leiritila, bioase-suoja, ylikuumenemissuoja (tila ja lämpötila), esilämmitysaikataulut |
| **Lataus** | Aloitus ja lopetus, latausluukku, latausraja, latausvirta, vakio- tai maksimilataus, ajastettu lähtö (esilämmitys ja yösähkö), latausaikataulut, lähimmät Superchargerit ja navigointi niille |
| **Kartta** | Auton sijainti ja suunta, osoitteen tai karttapisteen lähetys auton navigaattoriin, lähin Supercharger, HomeLink |
| **Turva** | Lukitus, etu- ja takaluukku, ikkunat, kattoluukku, Cybertruckin lavakate, vartiotila, vierastila, valet-tila, PIN ajamiseen, nopeusrajoitin, avaimeton ajo |
| **Lisää** | Käyttöönotto-ohjattu, auton nimeäminen, virransäästö, lisävarustevirta, Boombox, lapsilukko, käyttäjätietojen poisto, ohjelmistopäivitysten ajastus, **kaikki Fleet API -tietohaut** (huolto, hälytykset, kuljettajat, takuu, lataushistoria, varusteet…), **komentokonsoli** (kaikki noin 80 komentoa) ja **REST-konsoli** |

Lisäksi mukana ovat tumma ja vaalea teema, mobiilinäkymä (voi lisätä kotinäytölle), automaattinen
herätys komentoa lähetettäessä, nukkuvan auton välimuistitiedot ja suomenkielinen käyttöliittymä.

## Miten se toimii

```
Selain (GitHub Pages)
  ├─ OAuth 2.0 + PKCE ──────────────► auth.tesla.com / fleet-auth…  (kirjautuminen)
  ├─ REST: vehicle_data, wake_up… ──► fleet-api.prd.eu.vn.cloud.tesla.com
  └─ signed_command ────────────────► Fleet API ──► auto tarkistaa allekirjoituksen
        ▲
        └─ ECDH (P-256) + HMAC-SHA256 omalla avaimella, WebCryptolla selaimessa
```

* **Tunnukset ja avain pysyvät selaimessa** (`localStorage`). Mitään ei lähetetä muualle kuin Teslalle.
* Komentojen allekirjoitus (`js/vcp.js`) noudattaa Teslan virallista SDK:ta
  ([teslamotors/vehicle-command](https://github.com/teslamotors/vehicle-command)). Se on testattu
  Teslan oman Go-verifierin kanssa: kaikki 77 allekirjoitettua komentoa, istunnon uudelleensynkronointi
  sekä salatut vastaukset (`tests/run.sh`).
* Protobuf-määrittelyt (`proto/tesla.json`) ovat Teslan komentoprotokollan uusin versio, joten mukana
  ovat myös navigointi, Boombox ja rattilämmityksen tasot.

## Käyttöönotto (noin 20 minuuttia)

### 1. GitHub Pages

Sovellus voi asua missä tahansa repossa, esimerkiksi `salama` → `https://<käyttäjä>.github.io/salama/`.
Avaa reposta **Settings → Pages → Deploy from a branch → `main` / root**.

Tesla hakee julkisen avaimen kuitenkin aina **verkkotunnuksen juuresta**:
`https://<käyttäjä>.github.io/.well-known/appspecific/com.tesla.3p.public-key.pem`.
Juureen voi julkaista vain repo nimeltä **`<käyttäjä>.github.io`**, joten:

* Jos sovellus on jossain muussa repossa, luo lisäksi repo `<käyttäjä>.github.io`. Siihen riittää
  `.well-known/appspecific/com.tesla.3p.public-key.pem` ja tyhjä `.nojekyll`-tiedosto. Ota siitäkin
  Pages käyttöön. Muiden repojen sivut, kuten `/salama/`, toimivat edelleen normaalisti.
* Jos sovellus on suoraan `<käyttäjä>.github.io`-repossa, avain menee samaan repoon.

`.nojekyll` tarvitaan, jotta GitHub julkaisee `.well-known`-kansion.

### 2. Sovellus Teslan kehittäjäportaalissa

Luo sovellus osoitteessa [developer.tesla.com](https://developer.tesla.com):

* **OAuth grant types**: Authorization Code ja Client Credentials
* **Allowed Origin**: `https://<käyttäjätunnus>.github.io`
* **Redirect URI**: sovelluksen osoite, esim. `https://<käyttäjätunnus>.github.io/salama/`
* **Scopes**: Vehicle Information, Vehicle Location, Vehicle Commands, Vehicle Charging Management

Kopioi Client ID ja Client Secret.

### 3. Loput tehdään sovelluksessa: Lisää → Käyttöönotto

1. Syötä **Client ID** (ja Client Secret) ja valitse alueeksi **Eurooppa**.
2. **Luo avainpari** → **Lataa julkinen avain** → lisää tiedosto `<käyttäjä>.github.io`-repoon
   polkuun `.well-known/appspecific/com.tesla.3p.public-key.pem` ja pushaa. Sovellus näyttää vihreän
   merkin, kun julkaistu avain täsmää.
3. **Rekisteröi nyt**. Tämä tehdään kerran. Vaihtoehtoisesti voit ajaa skriptin:
   ```bash
   CLIENT_ID=... CLIENT_SECRET=... DOMAIN=<käyttäjätunnus>.github.io ./scripts/register-partner.sh
   ```
4. **Kirjaudu Tesla-tilillä** ja hyväksy oikeudet.
5. **Lisää virtuaaliavain autoon**: avaa `https://tesla.com/_ak/<käyttäjätunnus>.github.io`
   puhelimella, jossa on Tesla-sovellus, ja hyväksy avain avainkortilla. Kokeile sitten
   **Testaa yhteys**.

> **Vie yksityinen avain talteen** (Käyttöönotto → *Vie yksityinen avain*), jos haluat käyttää samaa
> avainta toisella laitteella (*Tuo avain*). **Älä koskaan lisää yksityistä avainta repoon.**

### Jos selain estää kutsut (CORS)

Teslan rajapinnat sallivat selainkutsut sovellukseen rekisteröidystä originista (*Allowed Origin*).
Tätä ei pystytty testaamaan oikeaa Teslaa vastaan, joten mukana on varasuunnitelma. Jos näet virheen
*"Selain esti pyynnön (todennäköisesti CORS)"*, ota käyttöön pieni välityspalvelin:

```bash
cd worker
# muokkaa wrangler.toml: ALLOWED_ORIGINS = "https://<käyttäjätunnus>.github.io"
npx wrangler deploy
npx wrangler secret put CLIENT_SECRET   # valinnainen: secret ei silloin ole selaimessa
```

Syötä Workerin osoite sovelluksen asetukseen **CORS-välityspalvelin**. Worker välittää vain Teslan
palvelimille ja vain sinun sivultasi. Cloudflaren ilmaistaso riittää hyvin.

## Hyvä tietää

* **Fleet API on maksullinen.** Tesla laskuttaa tietohauista, komennoista ja herätyksistä, mutta
  henkilökohtaisen käytön kuukausittainen ilmaiskiintiö yleensä riittää. Tarkista ajantasainen
  hinnoittelu developer.tesla.comista. Kipinä säästää kutsuja: se päivittää vain, kun sivu on
  näkyvissä ja auto hereillä, eikä herätä autoa itsestään. Päivitysväli on säädettävissä.
* **Vanhat Model S/X (ennen 2021)** eivät tue allekirjoitettuja komentoja. Valitse silloin
  asetuksista *Komentotapa → REST*.
* Osa ominaisuuksista riippuu autosta: istuintuuletus, kattoluukku, lavakate, Boombox ja HomeLink.
* Komentoprotokolla on varmistettu Teslan virallista verifieriä vastaan. Ensimmäinen testi oikealla
  autolla on silti sinun: aloita vaarattomasta komennosta, esimerkiksi **Vilkuta valoja**.

## Kehitys

Rakennusvaihetta ei ole: pelkkää HTML:ää, CSS:ää ja ES-moduuleja.

```bash
python3 -m http.server 8000     # avaa http://localhost:8000 → Kokeile demoa
./tests/run.sh                  # allekirjoitustesti Teslan virallista verifieriä vastaan (go + node)
```

| Tiedosto | Sisältö |
|---|---|
| `js/vcp.js` | Vehicle Command Protocol: istunto, ECDH, HMAC-allekirjoitus, vastausten purku |
| `js/commands.js` | Kaikki ajoneuvokomennot: REST-parametrit → protobuf |
| `js/api.js` | Fleet API -asiakas, OAuth + PKCE, partner-rekisteröinti |
| `js/keys.js` | Avainten luonti, tuonti ja vienti (WebCrypto, PEM) |
| `js/app.js`, `views.js`, `more.js` | Käyttöliittymä |
| `js/demo.js` | Simuloitu auto |
| `proto/tesla.json` | Teslan protobuf-määrittelyt protobufjs-muodossa |
| `worker/` | Valinnainen CORS-välityspalvelin (Cloudflare Worker) |
| `vendor/` | protobufjs (BSD-3) ja Leaflet (BSD-2) |

Kipinä on itsenäinen harrasteprojekti, eikä se ole Tesla, Inc:n tekemä tai hyväksymä. Kartat:
© OpenStreetMap-tekijät.
