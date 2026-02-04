# Guide de Signature et Notarisation macOS pour Chorus

Ce guide explique comment configurer la signature de code et la notarisation Apple pour distribuer Chorus sans friction sur macOS.

## Pourquoi c'est nécessaire ?

Sans signature et notarisation, les utilisateurs macOS verront :
- "L'application ne peut pas être ouverte car le développeur n'est pas identifié"
- Des demandes de permissions répétées à chaque lancement
- Des manipulations manuelles requises (clic droit → Ouvrir, xattr, etc.)

Avec signature et notarisation :
- L'app s'ouvre en double-cliquant, sans warning
- Les permissions sont demandées une seule fois
- L'expérience est professionnelle

## Prérequis

### 1. Compte Apple Developer (99$/an)

Inscris-toi sur https://developer.apple.com/programs/

### 2. Créer les certificats

1. Va sur https://developer.apple.com/account/resources/certificates/list
2. Clique sur "+" pour créer un nouveau certificat
3. Sélectionne **"Developer ID Application"** (pour distribution hors App Store)
4. Suis les instructions pour générer un CSR depuis Keychain Access
5. Télécharge le certificat (.cer) et installe-le dans Keychain Access

### 3. Exporter le certificat en .p12

1. Ouvre **Keychain Access**
2. Trouve ton certificat "Developer ID Application: [Ton nom]"
3. Clic droit → **Exporter**
4. Choisis le format **.p12**
5. Définis un mot de passe (tu en auras besoin pour GitHub)

### 4. Obtenir ton Team ID

1. Va sur https://developer.apple.com/account
2. Ton Team ID est affiché dans la section "Membership"
3. Format : 10 caractères alphanumériques (ex: ABC1234DEF)

### 5. Créer un App-Specific Password

1. Va sur https://appleid.apple.com/account/manage
2. Dans "Sécurité", clique sur "Mots de passe pour les apps"
3. Génère un nouveau mot de passe pour "Chorus CI"
4. Note-le (format: xxxx-xxxx-xxxx-xxxx)

## Configuration GitHub

### Ajouter les Secrets

Va dans ton repo GitHub → Settings → Secrets and variables → Actions → New repository secret

Ajoute ces secrets :

| Secret Name | Description | Exemple |
|-------------|-------------|---------|
| `APPLE_CERTIFICATE` | Certificat .p12 encodé en base64 | `cat cert.p12 \| base64` |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe du .p12 | `MonMotDePasse123` |
| `APPLE_SIGNING_IDENTITY` | Nom exact du certificat | `Developer ID Application: VentureIA (ABC1234DEF)` |
| `APPLE_ID` | Ton Apple ID | `contact@venture-ia.com` |
| `APPLE_PASSWORD` | App-Specific Password | `xxxx-xxxx-xxxx-xxxx` |
| `APPLE_TEAM_ID` | Team ID | `ABC1234DEF` |
| `KEYCHAIN_PASSWORD` | Mot de passe temporaire | `temporary-keychain-pw` |

### Encoder le certificat en base64

```bash
# Sur macOS
base64 -i certificate.p12 | pbcopy
# Le contenu est maintenant dans le presse-papier
```

```bash
# Sur Linux
base64 certificate.p12 > certificate_base64.txt
cat certificate_base64.txt
```

## Vérification

Après avoir configuré les secrets, push un commit sur `main`. Le workflow va :

1. ✅ Builder l'app pour macOS/Windows/Linux
2. ✅ Signer l'app macOS avec ton certificat Developer ID
3. ✅ Notariser l'app auprès d'Apple
4. ✅ Stapler le ticket de notarisation au DMG
5. ✅ Uploader le DMG signé et notarisé sur GitHub Releases

## Test local de la signature

```bash
# Vérifier la signature
codesign -dv --verbose=4 /Applications/Chorus.app

# Vérifier la notarisation
spctl -a -vv /Applications/Chorus.app

# Doit afficher : "source=Notarized Developer ID"
```

## Dépannage

### "The signature is invalid"

Le certificat n'est pas correctement importé. Vérifie :
- Le .p12 est bien encodé en base64
- Le mot de passe est correct
- Le signing identity correspond exactement au nom du certificat

### "Unable to upload to notarization service"

- Vérifie que l'App-Specific Password est valide
- Vérifie que le Team ID est correct
- Vérifie que ton compte Developer est en règle (abonnement actif)

### "The software you are installing has not been notarized"

La notarisation a échoué. Vérifie les logs du workflow pour voir l'erreur exacte d'Apple.

## Coûts

- Apple Developer Program : **99$/an**
- C'est le seul coût pour une distribution professionnelle sur macOS

## Alternative gratuite (avec friction)

Si tu ne veux pas payer, documente ces étapes pour tes utilisateurs :

```markdown
## Installation sur macOS (non signé)

1. Télécharge le .dmg
2. Ouvre-le et glisse Chorus dans Applications
3. **Important** : Clic droit sur Chorus.app → Ouvrir
4. Clique "Ouvrir" dans la popup de sécurité
5. L'app s'ouvrira normalement ensuite
```

Mais c'est une mauvaise expérience utilisateur et beaucoup de gens abandonneront.
