const fs = require('fs');
const path = require('path');

const clientJsPath = path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'Client.js');

if (!fs.existsSync(clientJsPath)) {
    console.warn('[patch-wwjs] whatsapp-web.js Client.js not found. Skipping patch.');
    process.exit(0);
}

let content = fs.readFileSync(clientJsPath, 'utf8');

if (content.includes('window.AuthStore.Conn?.ref')) {
    console.log('[patch-wwjs] whatsapp-web.js Client.js is already patched.');
    process.exit(0);
}

const startMarker = "const needAuthentication = await this.pupPage.evaluate(async () => {";
const endMarker = "if (needAuthentication) {";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `const needAuthentication = await this.pupPage.evaluate(async () => {
            let state = window.AuthStore.AppState.state;
            while (!window.AuthStore.Conn?.ref && (state === 'OPENING' || state === 'UNLAUNCHED' || state === 'PAIRING')) {
                await new Promise(r => setTimeout(r, 500));
                state = window.AuthStore.AppState.state;
            }
            if (window.AuthStore.Conn?.ref) return true;
            state = window.AuthStore.AppState.state;
            return state == 'UNLAUNCHED' || state == 'UNPAIRED' || state == 'UNPAIRED_IDLE';
        });

        `;
    content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
    fs.writeFileSync(clientJsPath, content, 'utf8');
    console.log('[patch-wwjs] Successfully patched whatsapp-web.js Client.js for modern WhatsApp Web Comet.');
} else {
    console.error('[patch-wwjs] Could not locate needAuthentication block in Client.js.');
}
