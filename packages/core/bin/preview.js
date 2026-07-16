export const previewTemplate = isExt => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Icon Diet - Preview</title>
  <link rel="stylesheet" href="${isExt ? './idiet.css' : './idiet/idiet.css'}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧁</text></svg>">
  <style>
    :root {
      --main-color: #0f9d58;
      --base-padding: 16px;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 2rem;
    }

    .panel-title {
      text-wrap: nowrap;
      font-size: 26px;
      font-weight: 800;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .panel-title-2 {
      color: var(--main-color);
    }

    .panel-subtitle {
      color: #94a3b8;
      font-size: 0.9rem;
      text-align: center;
    }

    .grid-container {
      flex-grow: 1;
      display: grid;
      grid-template-columns: repeat(auto-fit, 148px);
      padding: var(--base-padding) 24px 32px 24px;
      gap: 12px;
      overflow-y: auto;
      align-content: start;
      justify-content: center;
    }

    .section-title-base-icons {
      text-align: center;
      color: #1976D2;
    }

    .card-icon-item {
      background-color: #242424;
      border: 1px solid #2d2d2d;
      border-radius: 6px;
      padding: 18px 6px 12px 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
      position: relative;
      height: 85px;
      width: 120px;
    }

    .card-icon-item:hover {
      background-color: #2d2d2d;
      border-color: #444444;
    }

    .card-icon-wrapper {
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      font-size: 32px;
    }

    .card-icon-info {
      width: 100%;
      text-align: center;
    }

    .card-icon-fullname {
      font-size: 11px;
      color: #888888;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    #toast-wrapper {
      position: fixed;
      bottom: 24px;
      width: 100vw;
      display: flex;
      justify-content: center;
      z-index: 1000;
      pointer-events: none;
    }
    
    .toast {
      background: var(--main-color);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
      z-index: 1000;
    }
  </style>
</head>
<body>

  <div class="panel-title">
    Icon&nbsp;<span class="panel-title-2">Diet</span>
  </div>

  <div class="panel-subtitle">Click any card to copy the icon name to clipboard</div>

  <div class="grid-container">
    <!-- UserIconsGrid -->
  </div>

  <div class="section-title-base-icons">Built-in Quasar icons</div>
  <div class="grid-container">
    <!-- BaseIconsGrid -->
  </div>

  <div id="toast-wrapper">
    <div id="toast" class="toast">Name copied to clipboard!</div>
  </div>
  <script>
    function copyClass(className) {
      navigator.clipboard.writeText(className).then(() => {
        const toast = document.getElementById('toast');
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 2000);
      }).catch(err => console.error('Could not copy text: ', err));
    }
  </script>
</body>
</html>`