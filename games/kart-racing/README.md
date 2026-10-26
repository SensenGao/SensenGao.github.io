# Zoomies GP — Critter Kart Carnival

An arcade kart racer for the browser (three.js r170, ES modules, no build step).
Play: https://sensengao.github.io/games/kart-racing/

## Credits

- Based on **Turbo Kart Rally** by bridge-mind (https://github.com/bridge-mind/turbo-kart-rally, commit
  `c52aca3f10c7995884c316810cac6514daa40e9c`), MIT License — see `LICENSE` (kept verbatim).
- three.js r170 (MIT) — vendored in `vendor/three/` (licence in `vendor/three/LICENSE`).
- Luckiest Guy font by Astigmatic (Apache-2.0) — `fonts/LuckiestGuy-LICENSE.txt`.
- ZCOOL KuaiLe font (SIL OFL 1.1), subset to the Chinese UI characters — `fonts/ZCOOLKuaiLe-OFL.txt`.
- Racer models: procedural SDF modelling (code); music/SFX: procedural WebAudio.
- AI-generated art (textures, portraits, logo, icons) made with gpt-image-2 / Gemini image models; full list in
  `kart-racing/CREDITS.md` on the Hugging Face dataset `Sensen02/games-assets`.

Run locally: `python -m http.server` in this folder, open http://localhost:8000/.
