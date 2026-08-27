function buildPrintPreviewHtml(mode) {
  const collectRules = rules => {
    let normal = '';
    let print = '';
    for (const rule of Array.from(rules || [])) {
      try {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const cond = String(rule.conditionText || '').toLowerCase();
          if (cond.includes('print')) {
            for (const inner of Array.from(rule.cssRules || [])) print += inner.cssText + '\n';
          } else {
            normal += rule.cssText + '\n';
          }
        } else {
          normal += rule.cssText + '\n';
        }
      } catch (_) {}
    }
    return {normal,print};
  };

  let normalCss='',printCss='';
  for(const sheet of Array.from(document.styleSheets||[])){
    try{
      const out=collectRules(sheet.cssRules);
      normalCss+=out.normal;
      printCss+=out.print;
    }catch(_){}
  }

  const selectors={
    reports:'.print-reports',
    pending:'.pending-print-only',
    banks:'.bank-print-document:not(.bank-branch-print-document)',
    'bank-branch':'.bank-branch-print-document',
    loan:'.loan-print-document',
    'loan-overview':'.loans-overview-print-document',
    'loan-overview-category':'.overview-category-print .loans-overview-print-document',
    'loan-overview-single':'.overview-single-loan-print .loan-print-document'
  };

  const selector=selectors[mode];
  const source=selector ? document.querySelector(selector) : null;
  if(!source){
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"></head><body style="font-family:Cairo,sans-serif;padding:40px;text-align:center"><h3>تعذر تجهيز هذا التقرير للمعاينة</h3><p>لم يتم العثور على مستند الطباعة الخاص بهذا الزر.</p></body></html>`;
  }

  const clone=source.cloneNode(true);
  clone.querySelectorAll('button,input,textarea,select,.page-toolbar,.reports-layout-bar,.pending-import-bar,.pending-entry,.pending-screen-groups').forEach(el=>{
    // Do not remove table text fields from reports if they are inside dedicated print tables.
    if(el.closest('.report-print-table,.professional-print-table,.pending-print-card,.bank-print-document')) return;
    el.remove();
  });

  const wrapperClass={
    reports:'preview-reports-root',
    pending:'preview-pending-root',
    banks:'preview-banks-root',
    'bank-branch':'preview-banks-root',
    loan:'preview-loan-root',
    'loan-overview':'preview-loan-overview-root',
    'loan-overview-category':'preview-loan-overview-root',
    'loan-overview-single':'preview-loan-root'
  }[mode]||'';

  const previewOverrides=`
    html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}
    body{font-family:'Cairo',sans-serif!important}
    .desktop-titlebar,.sidebar,.date-header,.print-preview-overlay{display:none!important}
    .content{margin:0!important;padding:0!important;width:100%!important;max-width:none!important}
    .${wrapperClass}{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
    .professional-print-document,.pending-print-only,.pending-print-card,.bank-print-document,.report-print-table-wrap{display:block!important}
    .screen-excel-table,.pending-screen-groups{display:none!important}
    .print-preview-only-hide{display:none!important}
    /* Botanical preview paper: neutral cream/white canvas; report accents come from print CSS. */
    .pending-print-only,.bank-print-document,.professional-print-document,.print-reports{background:#fff!important;color:#0D1B2A!important}
  `;

  const bodyPrintMode=mode==='bank-branch'?'banks':mode;
  const bodyExtra=mode==='bank-branch'?' data-bank-branch-print="1"':'';
  return `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <base href="${document.baseURI}">
      <style>${normalCss}\n${printCss}\n${previewOverrides}</style>
    </head>
    <body data-theme="light" data-print-mode="${bodyPrintMode}"${bodyExtra}>
      <main class="${wrapperClass}">${clone.outerHTML}</main>
    </body>
  </html>`;
}

export { buildPrintPreviewHtml };
