const fs = require("fs");
const path =
  "d:\\\\My Project\\\\apk-absen-karimiyah\\\\frontend\\\\app\\\\body.html";
let content = fs.readFileSync(path, "utf8");
content = content.replace(
  /(<div\s+)style="(display:\s*flex;\s*align-items:\s*center;\s*justify-content:\s*space-between;[^"]*)"/g,
  '$1class="toolbar-header" style="$2"',
);
content = content.replace(
  /(<div\s+)style="(display:\s*flex;\s*align-items:\s*center;\s*gap:\s*8px;[^"]*)"/g,
  '$1class="toolbar-actions" style="$2"',
);
content = content.replace(
  /(<div\s+)style="(display:\s*flex;\s*align-items:\s*center;\s*gap:\s*10px;[^"]*)"/g,
  '$1class="toolbar-actions" style="$2"',
);
content = content.replace(
  /(<div\s+)style="(display:\s*flex;\s*gap:\s*8px;[^"]*)"/g,
  '$1class="toolbar-actions" style="$2"',
);
fs.writeFileSync(path, content);
console.log("Done");
