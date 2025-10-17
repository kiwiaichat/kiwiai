const path = require("path");
const fs = require("fs");

// Automatically relocate TensorFlow DLL to prevent DLOPEN errors
// This must run BEFORE @tensorflow/tfjs-node is required
try {
  const tfDllSource = path.join(__dirname, 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib', 'tensorflow.dll');
  const tfDllTarget = path.join(__dirname, 'node_modules', '@tensorflow', 'tfjs-node', 'lib', 'napi-v8', 'tensorflow.dll');

  // Check if source exists and target doesn't exist or is different
  if (fs.existsSync(tfDllSource)) {
    const targetDir = path.dirname(tfDllTarget);

    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log('[TensorFlow DLL] Created directory:', targetDir);
    }

    // Check if target already exists
    if (!fs.existsSync(tfDllTarget)) {
      fs.copyFileSync(tfDllSource, tfDllTarget);
      console.log('[TensorFlow DLL] Successfully relocated tensorflow.dll to prevent DLOPEN errors');
    } else {
      console.log('[TensorFlow DLL] Already exists at target location');
    }
  } else {
    console.log('[TensorFlow DLL] Source file not found at:', tfDllSource);
  }
} catch (error) {
  console.error('[TensorFlow DLL] Failed to relocate:', error.message);
}
