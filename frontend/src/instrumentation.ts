export async function register() {
  // The standalone Next server can trip over optional native ws helpers when
  // bundled. Keep the transport on the pure-JS path unless the runtime proves
  // otherwise.
  if (!process.env.WS_NO_BUFFER_UTIL) {
    process.env.WS_NO_BUFFER_UTIL = '1';
  }
  if (!process.env.WS_NO_UTF_8_VALIDATE) {
    process.env.WS_NO_UTF_8_VALIDATE = '1';
  }
}
