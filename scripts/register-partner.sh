#!/usr/bin/env bash
# Rekisteröi sovelluksesi Teslan Fleet API -alueelle (tehdään kerran per alue).
# Tesla hakee julkisen avaimesi osoitteesta
#   https://$DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
# joten julkaise se GitHub Pagesiin ennen tämän ajamista.
#
# Käyttö:
#   CLIENT_ID=... CLIENT_SECRET=... DOMAIN=kayttaja.github.io ./scripts/register-partner.sh
#   (valinnainen REGION=eu|na, oletus eu)
set -euo pipefail

: "${CLIENT_ID:?Aseta CLIENT_ID}"
: "${CLIENT_SECRET:?Aseta CLIENT_SECRET}"
: "${DOMAIN:?Aseta DOMAIN, esim. kayttaja.github.io}"
REGION="${REGION:-eu}"

case "$REGION" in
  eu) API="https://fleet-api.prd.eu.vn.cloud.tesla.com" ;;
  na) API="https://fleet-api.prd.na.vn.cloud.tesla.com" ;;
  *) echo "Tuntematon REGION: $REGION" >&2; exit 1 ;;
esac

echo "1/3 Tarkistetaan julkinen avain: https://$DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem"
curl -fsS "https://$DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem" | head -1

echo "2/3 Haetaan partner-tunnus…"
TOKEN=$(curl -fsS -X POST https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "scope=openid vehicle_device_data vehicle_cmds vehicle_charging_cmds" \
  --data-urlencode "audience=$API" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

echo "3/3 Rekisteröidään $DOMAIN alueelle $REGION…"
curl -fsS -X POST "$API/api/1/partner_accounts" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"domain\": \"$DOMAIN\"}"
echo
echo "Tarkistus (Teslan tallentama julkinen avain):"
curl -fsS "$API/api/1/partner_accounts/public_key?domain=$DOMAIN" -H "Authorization: Bearer $TOKEN"
echo
echo "Valmis. Lisää seuraavaksi virtuaaliavain autoon: https://tesla.com/_ak/$DOMAIN"
