const fs = require('fs');
const path = require('path');

const mappings = {
  // Backgrounds
  "bg-white": "dark:bg-slate-900",
  "bg-slate-50": "dark:bg-slate-950",
  "bg-gray-50": "dark:bg-slate-800",
  // Borders
  "border-gray-200": "dark:border-slate-800",
  "border-slate-200": "dark:border-slate-800",
  "border-slate-100": "dark:border-slate-800",
  "border-gray-100": "dark:border-slate-800",
  // Texts
  "text-slate-900": "dark:text-slate-50",
  "text-gray-900": "dark:text-slate-50",
  "text-slate-800": "dark:text-slate-100",
  "text-gray-800": "dark:text-slate-100",
  "text-slate-700": "dark:text-slate-300",
  "text-gray-700": "dark:text-slate-300",
  "text-slate-500": "dark:text-slate-400",
  "text-gray-500": "dark:text-slate-400",
  "text-slate-400": "dark:text-slate-500",
  "text-gray-400": "dark:text-slate-500",
  // Hovers
  "hover:bg-gray-50": "dark:hover:bg-slate-800/40",
  "hover:bg-slate-50": "dark:hover:bg-slate-800/40"
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // We look for className="..." or className={`...`}
  const classRegex = /className=(["'])(.*?)\1|className=\{`([^`]+)`\}/gs;

  content = content.replace(classRegex, (match, quote, p1, p2) => {
    let classesStr = p1 || p2;
    let newClassesStr = classesStr;

    if (p1) {
      // Regular string
      let classArray = newClassesStr.split(/\s+/).filter(Boolean);
      for (const [lightClass, darkClass] of Object.entries(mappings)) {
        if (classArray.includes(lightClass) && !classArray.includes(darkClass)) {
          const index = classArray.indexOf(lightClass);
          classArray.splice(index + 1, 0, darkClass);
          changed = true;
        }
      }
      return `className="${classArray.join(' ')}"`;
    } else {
      // Template literal (might contain ${})
      let modifiedStr = newClassesStr;
      for (const [lightClass, darkClass] of Object.entries(mappings)) {
        const regex = new RegExp(`(?<![a-zA-Z0-9-:])` + lightClass + `(?![a-zA-Z0-9-:])`, 'g');
        if (regex.test(modifiedStr) && !modifiedStr.includes(darkClass)) {
          modifiedStr = modifiedStr.replace(regex, `${lightClass} ${darkClass}`);
          changed = true;
        }
      }
      return "className={`" + modifiedStr + "`}";
    }
  });
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
