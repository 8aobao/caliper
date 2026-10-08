// Script-tag build: <script src="http://localhost:4848/caliper.js"></script> served by caliper-mcp.
// Talks to the server it was loaded from unless window.CALIPER_ENDPOINT says otherwise.
import { mount } from './core.js';

const script = document.currentScript;
const endpoint = window.CALIPER_ENDPOINT || (script && script.src ? new URL(script.src).origin : undefined);
mount({ endpoint });
