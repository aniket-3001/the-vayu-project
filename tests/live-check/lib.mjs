import { launch } from './cdp.mjs';
export const L = process.env.LIVE_URL ?? 'https://d3lmq1mze2gup3.cloudfront.net';
export async function open(opts) {
  const b = await launch(opts);
  b.T = async (n = 1500) =>
    (await b.eval(`document.body.innerText`)).replace(/\n{2,}/g, '\n').slice(0, n);
  b.type = (sel, v) =>
    b.eval(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  b.click = (re) =>
    b.eval(
      `(()=>{const e=[...document.querySelectorAll('button,a,[role=button],[role=switch],[role=tab]')].find(e=>new RegExp(${JSON.stringify(re)},'i').test(((e.getAttribute('aria-label')||'')+' '+e.innerText).trim()));if(e){e.click();return true}return false})()`,
    );
  return b;
}
