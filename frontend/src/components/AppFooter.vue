<!--
  The sign-off at the bottom of the leaderboard and the profile, as on
  BottleCount and treblewise: the name, the source, privacy and terms on the
  left, who made it and a way to support it on the right.
-->
<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer-group">
      <span>© {{ year }} Maraffometro</span>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a
        class="app-footer-source"
        href="https://github.com/Fre0Grella/maraffometro"
        target="_blank"
        rel="noreferrer"
        aria-label="Codice sorgente su GitHub"
        title="Codice sorgente su GitHub"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
          />
        </svg>
      </a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <RouterLink to="/privacy">Privacy</RouterLink>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <RouterLink to="/terms">Termini</RouterLink>
    </div>
    <div class="app-footer-group">
      <span>Made with ❤️ by FreoGrella</span>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://github.com/Fre0Grella" target="_blank" rel="noreferrer">GitHub</a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://www.linkedin.com/in/marco-galeri-2b6500384/" target="_blank" rel="noreferrer">LinkedIn</a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a class="app-footer-donate" href="https://ko-fi.com/freogrella" target="_blank" rel="noreferrer">☕ Donate</a>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-top: 32px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 0.75rem;
  color: var(--ink-2);
}
.app-footer-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.app-footer-sep {
  opacity: 0.55;
}
.app-footer a {
  color: var(--ink-2);
  text-decoration: none;
}
.app-footer a:hover,
.app-footer a:focus-visible {
  color: var(--ink);
}
.app-footer-source {
  display: inline-flex;
  align-items: center;
  /* A bigger tap target than the 15px mark. */
  margin: -6px;
  padding: 6px;
}
.app-footer .app-footer-donate {
  color: var(--team-a);
  font-weight: 600;
}
</style>
