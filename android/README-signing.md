# Android signing

The app is signed with one permanent key so every new APK installs over the old one (keeping
your data). The key is **not** in this repository. It lives:

- on the PC that created it, in `Projects/FitnessCoach-signing/` (keystore + password), and
- in this repo's GitHub Actions secrets:
  `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

If the secrets are ever lost, restore them from that folder. If the key itself is lost, a new
one can be made, but the phone will need the old app uninstalled first (back up your data!).
