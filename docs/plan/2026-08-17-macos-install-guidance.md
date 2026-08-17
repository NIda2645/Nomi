# macOS installation guidance

## Scope

- Warn before download that the current macOS builds are not Apple Developer ID signed or notarized.
- Add bilingual first-launch recovery steps to the download dialog, the no-JavaScript fallback, and both READMEs.
- Keep every existing website and README installer URL as a direct latest-asset download.
- Add regression coverage for the warning, official-source qualifier, and quarantine-removal command.

## Out of scope

- No installer rebuild, signing, notarization, release replacement, or version bump.
- No global Gatekeeper-disable instructions.
- No change to Windows download behavior beyond preserving its existing warning.

## Safety

- Prefer Finder **Open** and macOS **Privacy & Security → Open Anyway** before any Terminal command.
- Show `xattr -dr com.apple.quarantine "/Applications/Nomi.app"` only for the macOS “damaged” message and only after the user confirms the app came from an official Nomi download link.

## Acceptance

1. Chinese and English visitors can see the unsigned/notarized warning beside the primary download action.
2. The download dialog and no-JavaScript fallback contain the complete macOS first-launch sequence.
3. Both READMEs contain the same safe sequence and retain direct latest-installer links.
4. Static, visual, site, and full repository gates pass.
5. Desktop and mobile screenshots show readable guidance without overlap or horizontal overflow.
