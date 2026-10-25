"""Read-only inspection helper for the active Chrome remote-app tab.

Never pass credentials, session URLs, or tokens to this utility.
"""
import base64
import json
import pathlib
import subprocess
import sys
import time


def run(js):
    script = 'tell application "Google Chrome" to tell tab id 1160888377 of window id 1160888297 to execute javascript ' + json.dumps(js)
    result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


if len(sys.argv) < 2:
    pass
elif sys.argv[1] == 'inspect-input':
    print(run('''(()=>{fetch('/software/html5/jws.js').then(r=>r.text()).then(s=>{
    const terms=['mousedown','pointerdown','clientX','pageX','screenX','isTrusted'];
    window.__localInputInspection=terms.map(t=>({term:t,samples:Array.from(s.matchAll(new RegExp(t,'g'))).slice(0,4).map(m=>s.slice(Math.max(0,m.index-160),m.index+300))}));
    });return 'Inspecting static client input handling';})()'''))
elif sys.argv[1] == 'input-result':
    print(run('JSON.stringify(window.__localInputInspection||null)'))
elif sys.argv[1] == 'capture':
    data = run('document.querySelector("canvas").toDataURL("image/png")')
    pathlib.Path(sys.argv[2]).write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print('Captured application canvas.')
elif sys.argv[1] == 'sequence':
    actions = json.loads(sys.argv[2])
    for action in actions:
        if 'wait' in action:
            time.sleep(min(float(action['wait']), 10))
        if 'click' in action:
            x, y = action['click']
            run('''(()=>{const c=document.querySelector("canvas"),r=c.getBoundingClientRect();
            const p={clientX:r.left+r.width*%s,clientY:r.top+r.height*%s,bubbles:true,button:0,buttons:1};
            c.dispatchEvent(new MouseEvent('mousemove',p));
            c.dispatchEvent(new MouseEvent('mousedown',p));
            c.dispatchEvent(new MouseEvent('mouseup',{...p,buttons:0}));
            c.dispatchEvent(new MouseEvent('click',{...p,buttons:0}));return true;})()''' % (x, y))
            time.sleep(3)
        if 'capture' in action:
            data = run('document.querySelector("canvas").toDataURL("image/png")')
            pathlib.Path(action['capture']).write_bytes(base64.b64decode(data.split(',', 1)[1]))
            print(action['capture'])
elif sys.argv[1] == 'click':
    x, y = map(float, sys.argv[2:4])
    print(run('''(()=>{const c=document.querySelector("canvas"),r=c.getBoundingClientRect();
    const p={clientX:r.left+r.width*%s,clientY:r.top+r.height*%s,bubbles:true,button:0,buttons:1};
    c.dispatchEvent(new PointerEvent('pointermove',{...p,pointerId:1,pointerType:'mouse',isPrimary:true}));
    c.dispatchEvent(new PointerEvent('pointerdown',{...p,pointerId:1,pointerType:'mouse',isPrimary:true}));
    c.dispatchEvent(new PointerEvent('pointerup',{...p,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true}));
    c.dispatchEvent(new MouseEvent('mousemove',p));
    c.dispatchEvent(new MouseEvent('mousedown',p));
    c.dispatchEvent(new MouseEvent('mouseup',{...p,buttons:0}));
    c.dispatchEvent(new MouseEvent('click',{...p,buttons:0}));
    return 'Clicked application control';})()''' % (x, y)))
