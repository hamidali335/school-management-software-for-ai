/**
 * Code-signing placeholder hook for electron-builder (Slice 6).
 */
exports.default = async function sign(configuration) {
  if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
    console.log(`[sign-placeholder] Skipping Authenticode signing (unsigned build): ${configuration.path}`);
    return;
  }
  console.log(`[sign-placeholder] Signing hook invoked for: ${configuration.path}`);
};
