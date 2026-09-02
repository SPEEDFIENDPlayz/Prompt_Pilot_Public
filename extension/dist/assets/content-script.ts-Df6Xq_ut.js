import{d as E}from"./device-capabilities-k0pcgEFZ.js";function y(n,t){return n.left<t.right&&n.right>t.left&&n.top<t.bottom&&n.bottom>t.top}function C(n,t,e){const i=e.padding,s=e.gap,o=Math.max(i,e.width-t.width-i),r=Math.max(i,e.height-t.height-i),a=c=>Math.min(Math.max(i,c),o),d=c=>Math.min(Math.max(i,c),r),h=n.top+(n.bottom-n.top-t.height)/2;return[{side:"left",left:n.left-t.width-s,top:h},{side:"right",left:n.right+s,top:h},{side:"above",left:n.left,top:n.top-t.height-s},{side:"below",left:n.left,top:n.bottom+s}].map(({side:c,left:g,top:l})=>{const p=a(g),b=d(l);return{side:c,left:p,top:b,rect:{left:p,top:b,right:p+t.width,bottom:b+t.height}}})}function u(n){const t=n,e=getComputedStyle(t),i=t.getBoundingClientRect();return e.display!=="none"&&e.visibility!=="hidden"&&i.width>0&&i.height>0}function m(n){return n instanceof HTMLTextAreaElement||n instanceof HTMLElement&&n.isContentEditable}function A(n){return n.reduce((t,e)=>({left:Math.min(t.left,e.left),right:Math.max(t.right,e.right),top:Math.min(t.top,e.top),bottom:Math.max(t.bottom,e.bottom)}))}class T{mount;anchoredComposer;anchoredSurface;repositionFrame;listenersAttached=!1;layoutHost;scheduleReposition=()=>{!this.mount?.isConnected||!this.anchoredComposer?.isConnected||(this.repositionFrame!==void 0&&cancelAnimationFrame(this.repositionFrame),this.repositionFrame=requestAnimationFrame(()=>{this.repositionFrame=void 0,this.positionMount()}))};findComposer(){const t=document.querySelector("#prompt-textarea");if(t&&m(t)&&u(t))return t;const e=[...document.querySelectorAll("form")].find(o=>u(o)?[...o.querySelectorAll("textarea, [contenteditable='true']")].some(r=>m(r)&&u(r)):!1),i=e&&[...e.querySelectorAll("textarea, [contenteditable='true']")].find(o=>m(o)&&u(o));if(i&&m(i))return i;const s=[...document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']")].find(o=>{const r=`${o.getAttribute("aria-label")??""} ${o.getAttribute("placeholder")??""}`.toLowerCase();return m(o)&&u(o)&&(r.includes("message")||r.includes("chatgpt"))});return s&&m(s)?s:null}findComposerTarget(){const t=this.findComposer();return t?{editable:t,surface:this.findComposerSurface(t)}:null}findComposerSurface(t){const e=t.getBoundingClientRect(),i=t.closest("form");if(i instanceof HTMLElement&&u(i)){const o=i.getBoundingClientRect();if(o.height<=260&&o.width>=e.width)return i}let s=t.parentElement;for(;s&&s!==document.body;){if(u(s)){const o=s.getBoundingClientRect(),r=o.height<=260&&o.width>=e.width,a=o.width>e.width+8||o.height>e.height+8;if(r&&a)return s}s=s.parentElement}return t}findMountTarget(t=this.findComposer()){return t&&document.body?document.body:null}mountControls(t){const e=this.findComposerTarget();return e?(this.mount!==t&&this.mount?.isConnected&&this.mount.remove(),t.dataset.composer="prompt-pilot",t.style.display="block",t.style.position="fixed",t.style.zIndex="2147483647",t.parentElement!==document.body&&document.body.append(t),this.mount=t,this.anchoredComposer=e.editable,this.anchoredSurface=e.surface,this.layoutHost!==t&&(this.layoutHost?.removeEventListener("prompt-pilot:layout",this.scheduleReposition),t.addEventListener("prompt-pilot:layout",this.scheduleReposition),this.layoutHost=t),this.listenersAttached||(window.addEventListener("resize",this.scheduleReposition,{passive:!0}),document.addEventListener("scroll",this.scheduleReposition,{passive:!0,capture:!0}),this.listenersAttached=!0),this.positionMount(),!0):(this.mount?.remove(),this.mount=void 0,this.anchoredComposer=void 0,this.anchoredSurface=void 0,!1)}positionMount(){const t=this.mount,e=this.anchoredSurface;if(!t?.isConnected||!e?.isConnected)return;const i=e.getBoundingClientRect();if(!i.width||!i.height)return;const s=t.getBoundingClientRect(),o=12,r=Math.min(s.width||220,Math.max(0,window.innerWidth-o*2)),a=s.height||36,d=C(i,{width:r,height:a},{width:window.innerWidth,height:window.innerHeight,padding:o,gap:10});let h,v;for(const l of d){this.setHostPosition(t,l.left,l.top,l.side);const p=this.getOccupiedRect(t);if(!y(p,i)&&(h??=l,p.left>=o&&p.top>=o&&p.right<=window.innerWidth-o&&p.bottom<=window.innerHeight-o)){v=l;break}}const c=v??h??d[2]??d[0],g=!v;t.dataset.placementConstrained=g?"true":"false",this.setHostPosition(t,c.left,c.top,c.side),g&&t.dispatchEvent(new Event("prompt-pilot:placement-constrained"))}setHostPosition(t,e,i,s){t.style.left=`${Math.round(e)}px`,t.style.top=`${Math.round(i)}px`,s&&(t.dataset.placement=s),t.dispatchEvent(new Event("prompt-pilot:position"))}getOccupiedRect(t){const e=[t.getBoundingClientRect()],i=t.shadowRoot?.querySelector(".status-popover");return i&&!i.hidden&&e.push(i.getBoundingClientRect()),A(e)}readText(t=this.findComposer()){return t?t instanceof HTMLTextAreaElement?t.value:(t.innerText||t.textContent||"").replace(/\u00a0/g," "):""}focusComposer(t=this.findComposer()){t?.focus()}appendText(t){const e=this.findComposer();if(!e)return null;const i=this.readText(e),s=i.trim()?`

${t}`:t;if(this.focusComposer(e),e instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(e,i+s),e.dispatchEvent(new Event("input",{bubbles:!0,composed:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}));else{const r=window.getSelection(),a=document.createRange();if(a.selectNodeContents(e),a.collapse(!1),r?.removeAllRanges(),r?.addRange(a),!document.execCommand("insertText",!1,s)){const h=document.createTextNode(s);a.insertNode(h),a.setStartAfter(h),a.collapse(!0),r?.removeAllRanges(),r?.addRange(a),e.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0,inputType:"insertText",data:s}))}}const o=this.readText(e);return o.includes(t)?{before:i,after:o,inserted:s}:null}replaceExact(t,e){const i=this.findComposer();if(!i||this.readText(i)!==t)return!1;if(i instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set?.call(i,e),i.dispatchEvent(new Event("input",{bubbles:!0,composed:!0})),i.dispatchEvent(new Event("change",{bubbles:!0}));else{this.focusComposer(i);const s=window.getSelection(),o=document.createRange();o.selectNodeContents(i),s?.removeAllRanges(),s?.addRange(o),document.execCommand("insertText",!1,e)||(i.textContent=e,i.dispatchEvent(new InputEvent("input",{bubbles:!0,composed:!0,inputType:"insertText",data:e})))}return this.readText(i)===e}}class S{host=document.createElement("div");root;mic;level;status;shortcut;statusPopover;statusDetail;resultMenu;undoAction;rawAction;copyAction;setupAction;promptCopyAction;dismissAction;onAction;currentState="idle";actionsVisible=!1;popoverOpen=!1;constructor(t,e){this.onAction=e,this.host.className="prompt-pilot-host",this.host.dataset.promptPilot="true",this.root=this.host.attachShadow({mode:"open"}),this.host.addEventListener("prompt-pilot:position",()=>this.updatePopoverPlacement()),this.host.addEventListener("prompt-pilot:placement-constrained",()=>this.collapsePopoverForPlacement());const i=document.createElement("style");i.textContent=`
      :host {
        all: initial;
        position: fixed;
        display: block;
        box-sizing: border-box;
        width: max-content;
        max-width: calc(100vw - 24px);
        z-index: 2147483647;
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        --pp-bg: Canvas;
        --pp-fg: CanvasText;
        --pp-border: color-mix(in srgb, CanvasText 18%, transparent);
        --pp-hover: color-mix(in srgb, CanvasText 10%, Canvas);
      }
      .shell { position:relative; width:max-content; max-width:100%; }
      .bar {
        display:flex;
        align-items:center;
        gap:6px;
        box-sizing:border-box;
        width:max-content;
        max-width:calc(100vw - 24px);
        padding:4px;
        border:1px solid var(--pp-border);
        border-radius:12px;
        background:var(--pp-bg);
        color:var(--pp-fg);
        box-shadow:0 6px 22px rgb(0 0 0 / 22%);
        font:14px/1.2 system-ui, sans-serif;
        white-space:nowrap;
      }
      button, select {
        box-sizing:border-box;
        border:1px solid color-mix(in srgb, CanvasText 20%, transparent);
        border-radius:9px;
        background:color-mix(in srgb, CanvasText 5%, var(--pp-bg));
        color:inherit;
        font:inherit;
      }
      button { cursor:pointer; }
      button:hover, select:hover { background:var(--pp-hover); }
      button:focus-visible, select:focus-visible { outline:2px solid #5b9cff; outline-offset:1px; }
      button:disabled, select:disabled { cursor:default; opacity:.6; }
      .mic {
        display:inline-grid;
        place-items:center;
        width:36px;
        height:36px;
        flex:0 0 36px;
        padding:0;
        font-size:19px;
        line-height:1;
      }
      .mic svg { width:19px; height:19px; display:block; }
      .mic.recording { border-color:#ef4444; color:#ef4444; background:color-mix(in srgb, #ef4444 12%, var(--pp-bg)); }
      .level { width:58px; height:36px; padding:0 7px; flex:0 0 58px; }
      .shortcut { min-width:0; max-width:130px; overflow:hidden; text-overflow:ellipsis; opacity:.68; }
      .status-trigger {
        min-width:0;
        max-width:220px;
        min-height:30px;
        padding:5px 9px;
        overflow:hidden;
        text-overflow:ellipsis;
        text-align:left;
      }
      .status-trigger[hidden] { display:none; }
      .status-trigger.error { border-color:#e57373; color:#c62828; }
      .status-popover {
        position:absolute;
        left:0;
        top:calc(100% + 8px);
        z-index:1;
        box-sizing:border-box;
        width:min(360px, calc(100vw - 24px));
        max-height:min(70vh, 440px);
        overflow:auto;
        padding:12px;
        border:1px solid color-mix(in srgb, CanvasText 22%, transparent);
        border-radius:12px;
        background:var(--pp-bg);
        color:var(--pp-fg);
        box-shadow:0 8px 26px rgb(0 0 0 / 28%);
        white-space:normal;
      }
      .status-popover[data-align="right"] { left:auto; right:0; }
      .status-popover[data-side="top"] { top:auto; bottom:calc(100% + 8px); }
      .status-popover[hidden] { display:none; }
      .detail { overflow-wrap:anywhere; line-height:1.4; }
      .actions { display:grid; gap:6px; margin-top:10px; }
      .actions[hidden] { display:none; }
      .actions button { width:100%; min-height:32px; padding:6px 9px; text-align:left; }
      @media (max-width: 480px) {
        .shortcut { max-width:80px; }
        .status-trigger { max-width:150px; }
      }
    `,this.root.append(i);const s=document.createElement("div");s.className="shell";const o=document.createElement("div");o.className="bar",this.mic=document.createElement("button"),this.mic.className="mic",this.mic.type="button",this.mic.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"></path></svg>',this.mic.title="Start recording",this.mic.setAttribute("aria-label","Start recording"),this.level=document.createElement("select"),this.level.className="level",this.level.title="Processing level",this.level.setAttribute("aria-label","Processing level"),[[1,"L1"],[2,"L2"],[3,"L3"]].forEach(([r,a])=>{const d=document.createElement("option");d.value=String(r),d.textContent=String(a),this.level.append(d)}),this.level.value="2",this.shortcut=document.createElement("span"),this.shortcut.className="shortcut",this.status=document.createElement("button"),this.status.className="status-trigger",this.status.type="button",this.status.hidden=!0,this.status.setAttribute("aria-label","Prompt Pilot status"),this.status.setAttribute("aria-expanded","false"),this.statusPopover=document.createElement("div"),this.statusPopover.className="status-popover",this.statusPopover.hidden=!0,this.statusPopover.setAttribute("role","status"),this.statusDetail=document.createElement("div"),this.statusDetail.className="detail",this.statusPopover.append(this.statusDetail),this.resultMenu=document.createElement("div"),this.resultMenu.className="actions",this.resultMenu.hidden=!0,this.resultMenu.setAttribute("role","group"),this.undoAction=this.createAction("Undo insertion","undo"),this.rawAction=this.createAction("Use raw transcript","raw"),this.copyAction=this.createAction("Copy raw transcript","copy"),this.setupAction=this.createAction("Configure Gemini","configure"),this.promptCopyAction=this.createAction("Copy refined prompt","copy-prompt"),this.dismissAction=this.createAction("Dismiss","dismiss"),this.resultMenu.append(this.undoAction,this.rawAction,this.copyAction,this.setupAction,this.promptCopyAction,this.dismissAction),this.statusPopover.append(this.resultMenu),o.append(this.mic,this.level,this.shortcut,this.status),s.append(o,this.statusPopover),this.root.append(s),this.mic.addEventListener("click",t),this.status.addEventListener("click",()=>this.setPopoverOpen(!this.popoverOpen)),this.level.addEventListener("change",()=>{const r=Number(this.level.value);(r===1||r===2||r===3)&&chrome.runtime.sendMessage({type:"SET_PROCESSING_LEVEL",level:r}).catch(()=>{})}),document.addEventListener("click",r=>{this.host.contains(r.target)||this.setPopoverOpen(!1)},!0),document.addEventListener("keydown",r=>{r.key==="Escape"&&this.setPopoverOpen(!1)},!0),window.addEventListener("resize",()=>this.updatePopoverPlacement(),{passive:!0})}createAction(t,e){const i=document.createElement("button");return i.type="button",i.textContent=t,i.hidden=!0,i.addEventListener("click",()=>{this.setPopoverOpen(!1),this.onAction?.(e)}),i}get selectedLevel(){return Number(this.level.value)}set selectedLevel(t){this.level.value=String(t)}setShortcut(t){this.shortcut.textContent=t?`· ${t}`:"",this.host.dispatchEvent(new Event("prompt-pilot:layout"))}showResultActions(t,e=!1,i=!1,s=!1,o=t){this.actionsVisible=t,this.undoAction.hidden=!s,this.rawAction.hidden=!o,this.copyAction.hidden=!o,this.setupAction.hidden=!e,this.promptCopyAction.hidden=!i,this.dismissAction.hidden=!t,this.resultMenu.hidden=!t,this.host.dispatchEvent(new Event("prompt-pilot:layout")),t||this.setPopoverOpen(!1),t&&(this.currentState==="error"||this.currentState==="permission-needed")&&this.setPopoverOpen(!0)}setState(t,e){this.currentState=t,this.mic.classList.toggle("recording",t==="recording"),this.mic.disabled=["transcribing","refining"].includes(t),this.level.disabled=this.mic.disabled;const s={idle:"",recording:"Recording",transcribing:"Transcribing…",refining:"Refining…",inserted:"✓ Inserted","permission-needed":"Microphone setup needed",error:"⚠ Error"}[t]||"",o=e?this.summarize(e):s;this.status.textContent=o,this.status.hidden=!o,this.status.title=e||s,this.status.classList.toggle("error",t==="error"||t==="permission-needed"),this.statusDetail.textContent=e||s,this.status.setAttribute("aria-expanded",String(this.popoverOpen)),this.host.dataset.state=t,this.host.dispatchEvent(new Event("prompt-pilot:layout")),t==="idle"&&this.setPopoverOpen(!1),(t==="error"||t==="permission-needed")&&(e||this.actionsVisible)&&this.setPopoverOpen(!0)}setTimer(t){if(this.currentState!=="recording")return;const e=new Date(t*1e3).toISOString().slice(14,19);this.status.textContent=`Recording ${e}`,this.status.hidden=!1,this.host.dispatchEvent(new Event("prompt-pilot:layout"))}summarize(t){const e=t.split(/\r?\n/,1)[0].trim();return e.length>58?`${e.slice(0,55)}…`:e}setPopoverOpen(t){this.popoverOpen=t&&!!(this.status.textContent||this.actionsVisible),this.statusPopover.hidden=!this.popoverOpen,this.status.setAttribute("aria-expanded",String(this.popoverOpen)),this.host.dispatchEvent(new Event("prompt-pilot:layout")),this.popoverOpen&&this.updatePopoverPlacement()}collapsePopoverForPlacement(){this.popoverOpen&&(this.popoverOpen=!1,this.statusPopover.hidden=!0,this.status.setAttribute("aria-expanded","false"),this.host.dispatchEvent(new Event("prompt-pilot:layout")))}updatePopoverPlacement(){if(!this.popoverOpen)return;const t=this.host.getBoundingClientRect(),e=this.statusPopover.getBoundingClientRect(),i=Math.min(360,Math.max(0,window.innerWidth-24));this.statusPopover.dataset.align=t.left+i>window.innerWidth-12?"right":"left",this.statusPopover.dataset.side=t.bottom+e.height+8>window.innerHeight-12?"top":"bottom"}}class R{adapter=new T;ui;timer;startedAt=0;last;transcriptionMode="auto";deviceClass=E().deviceClass;constructor(){this.ui=new S(()=>void this.toggleRecording(),t=>void this.handleAction(t)),chrome.runtime.sendMessage({type:"GET_PROCESSING_LEVEL"}).then(({processingLevel:t})=>{(t===1||t===2||t===3)&&(this.ui.selectedLevel=t)}).catch(()=>{}),chrome.runtime.sendMessage({type:"GET_SHORTCUT"}).then(t=>this.ui.setShortcut(t?.shortcut??"")).catch(()=>{}),chrome.runtime.sendMessage({type:"GET_TRANSCRIPTION_MODE"}).then(t=>{(t?.transcriptionMode==="local"||t?.transcriptionMode==="cloud"||t?.transcriptionMode==="auto")&&(this.transcriptionMode=t.transcriptionMode)}).catch(()=>{})}mount(){return this.adapter.mountControls(this.ui.host)}async toggleRecording(){this.timer?(window.clearInterval(this.timer),this.timer=void 0,this.ui.setState("transcribing")):(this.startedAt=Date.now(),this.ui.setState("recording"),this.timer=window.setInterval(()=>this.ui.setTimer(Math.floor((Date.now()-this.startedAt)/1e3)),1e3)),await chrome.runtime.sendMessage({type:"TOGGLE_RECORDING",level:this.ui.selectedLevel,transcriptionMode:this.transcriptionMode,deviceClass:this.deviceClass})}async handleMessage(t){if(t.type==="STATE"&&(["permission-needed","error","inserted","idle"].includes(t.state)&&this.timer&&(window.clearInterval(this.timer),this.timer=void 0),this.ui.setState(t.state,t.detail)),t.type==="RAW_TRANSCRIPT"&&this.ui.setState("refining"),t.type==="RESULT"){this.last={result:{operationId:t.operationId,raw:t.raw,refined:t.refined}};const e=this.adapter.appendText(t.refined);if(!e){this.ui.setState("error","Composer not found — click to copy"),this.ui.showResultActions(!0,!1,!0,!1,!0);return}this.last.insertion=e,this.ui.setState("inserted"),this.ui.showResultActions(!0,!1,!0,!0,!0),await chrome.runtime.sendMessage({type:"CLEAR_PENDING_RESULT"})}if(t.type==="RESULT_ERROR"){this.timer&&(window.clearInterval(this.timer),this.timer=void 0),this.last={result:{operationId:t.operationId,raw:t.raw,error:{code:t.code,message:t.message}}},this.ui.setState("error",t.message);const e=t.code==="missing-key"||t.code==="invalid-key";this.ui.showResultActions(!0,e,!1,!1,!!t.raw)}}async handleAction(t){if(t==="configure"){try{if(!(await chrome.runtime.sendMessage({type:"OPEN_OPTIONS"}))?.ok)throw new Error("Settings could not be opened.");this.ui.setState("idle"),this.ui.showResultActions(!1)}catch(s){this.ui.setState("error",s instanceof Error?s.message:"Open Prompt Pilot settings from the extension menu.")}return}if(t==="dismiss"){this.ui.setState("idle"),this.ui.showResultActions(!1);return}const e=this.last?.result.raw;if(t==="copy-prompt"){const s=this.last?.result.refined;if(!s)return;try{await navigator.clipboard.writeText(s),this.ui.setState("inserted","✓ Prompt copied")}catch{this.ui.setState("error","Copy was blocked by the browser")}return}if(!e)return;if(t==="copy"){try{await navigator.clipboard.writeText(e),this.ui.setState("inserted","✓ Raw copied")}catch{this.ui.setState("error","Copy was blocked by the browser")}return}if(t==="undo"){const s=this.last?.insertion;s&&this.adapter.replaceExact(s.after,s.before)?this.ui.setState("inserted","✓ Undone"):this.ui.setState("error","Composer was edited; undo skipped");return}const i=this.last?.insertion;if(i&&this.adapter.replaceExact(i.after,i.before+(i.before.trim()?`

`:"")+e))this.ui.setState("inserted","✓ Raw inserted");else if(!i){const s=this.adapter.appendText(e);s?(this.last.insertion=s,this.ui.setState("inserted","✓ Raw inserted")):this.ui.setState("error","Composer not found — click to copy")}}}const f=new R;let x;function w(){x&&window.clearTimeout(x),x=window.setTimeout(()=>f.mount(),50)}const M=new MutationObserver(w);M.observe(document.documentElement,{childList:!0,subtree:!0});w();chrome.runtime.onMessage.addListener(n=>{if(n.type==="COMMAND_TOGGLE"){f.toggleRecording();return}f.handleMessage(n)});chrome.runtime.sendMessage({type:"GET_PENDING_RESULT"}).then(n=>{n?.result&&(n.result.refined?f.handleMessage({type:"RESULT",...n.result}):n.result.error&&f.handleMessage({type:"RESULT_ERROR",...n.result.error,operationId:n.result.operationId,raw:n.result.raw}))});
