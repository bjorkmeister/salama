// Test-only fake vehicle: emulates Fleet API /signed_command using Tesla's official Verifier.
package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/teslamotors/vehicle-command/internal/authentication"
	carserver "github.com/teslamotors/vehicle-command/pkg/protocol/protobuf/carserver"
	universal "github.com/teslamotors/vehicle-command/pkg/protocol/protobuf/universalmessage"
	"github.com/teslamotors/vehicle-command/pkg/protocol/protobuf/vcsec"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var (
	carKey, _ = authentication.NewECDHPrivateKey(rand.Reader)
	mu        sync.Mutex
	verifiers = map[string]*authentication.Verifier{}
	respCtr   uint32
	encrypt   = os.Getenv("ENCRYPT") == "1"
)

func verifier(vin string, domain universal.Domain, pub []byte) (*authentication.Verifier, error) {
	k := fmt.Sprintf("%s/%d/%x", vin, domain, pub)
	if v, ok := verifiers[k]; ok {
		return v, nil
	}
	v, err := authentication.NewVerifier(carKey, []byte(vin), domain, pub)
	if err == nil {
		verifiers[k] = v
	}
	return v, err
}

func handle(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	parts := strings.Split(r.URL.Path, "/")
	vin := parts[4]
	var body struct {
		RoutableMessage string `json:"routable_message"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	raw, _ := base64.StdEncoding.DecodeString(body.RoutableMessage)
	var req universal.RoutableMessage
	if err := proto.Unmarshal(raw, &req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	domain := req.GetToDestination().GetDomain()
	resp := &universal.RoutableMessage{
		ToDestination:   &universal.Destination{SubDestination: &universal.Destination_RoutingAddress{RoutingAddress: req.GetFromDestination().GetRoutingAddress()}},
		FromDestination: &universal.Destination{SubDestination: &universal.Destination_Domain{Domain: domain}},
		RequestUuid:     req.GetUuid(),
	}
	if sir := req.GetSessionInfoRequest(); sir != nil {
		v, err := verifier(vin, domain, sir.GetPublicKey())
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		v.SetSessionInfo(req.GetUuid(), resp)
		log.Printf("HANDSHAKE domain=%v", domain)
	} else {
		v, err := verifier(vin, domain, req.GetSignatureData().GetSignerIdentity().GetPublicKey())
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		plain, err := v.Verify(&req)
		var sigErr *authentication.InvalidSignatureError
		if errors.As(err, &sigErr) {
			log.Printf("FAULT %v", sigErr.Code)
			resp.SignedMessageStatus = &universal.MessageStatus{OperationStatus: universal.OperationStatus_E_OPERATIONSTATUS_ERROR, SignedMessageFault: sigErr.Code}
			v.SetSessionInfo(req.GetUuid(), resp)
		} else if err != nil {
			log.Printf("VERIFY ERROR %v", err)
			resp.SignedMessageStatus = &universal.MessageStatus{OperationStatus: universal.OperationStatus_E_OPERATIONSTATUS_ERROR, SignedMessageFault: universal.MessageFault_E_MESSAGEFAULT_ERROR_INVALID_SIGNATURE}
		} else {
			var out []byte
			if domain == universal.Domain_DOMAIN_INFOTAINMENT {
				var a carserver.Action
				uerr := proto.Unmarshal(plain, &a)
				j, _ := protojson.Marshal(&a)
				log.Printf("OK INFOTAINMENT %s unmarshalErr=%v unknown=%d", j, uerr, len(a.GetVehicleAction().ProtoReflect().GetUnknown()))
				out, _ = proto.Marshal(&carserver.Response{ActionStatus: &carserver.ActionStatus{Result: carserver.OperationStatus_E_OPERATIONSTATUS_OK}})
			} else {
				var m vcsec.UnsignedMessage
				uerr := proto.Unmarshal(plain, &m)
				j, _ := protojson.Marshal(&m)
				log.Printf("OK VCSEC %s unmarshalErr=%v", j, uerr)
				out, _ = proto.Marshal(&vcsec.FromVCSECMessage{SubMessage: &vcsec.FromVCSECMessage_CommandStatus{CommandStatus: &vcsec.CommandStatus{OperationStatus: vcsec.OperationStatus_E_OPERATIONSTATUS_OK}}})
			}
			resp.Payload = &universal.RoutableMessage_ProtobufMessageAsBytes{ProtobufMessageAsBytes: out}
			if encrypt {
				respCtr++
				if err := v.Encrypt(resp, authentication.RequestID(&req), respCtr); err != nil {
					log.Printf("ENCRYPT ERR %v", err)
				}
			}
		}
	}
	b, _ := proto.Marshal(resp)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"response": base64.StdEncoding.EncodeToString(b)})
}

func main() {
	http.HandleFunc("/api/1/vehicles/", handle)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+os.Getenv("PORT"), nil))
}
