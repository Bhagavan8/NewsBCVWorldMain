
document.addEventListener('DOMContentLoaded', function () {
  // Selector for each ad block that has an iframe and a backup element
  document.querySelectorAll('.ad-space').forEach(function (adSpace) {
    var backup = adSpace.querySelector('.ad-backup-content');
    var iframe = adSpace.querySelector('iframe');

    // If no iframe (unexpected), show backup immediately
    if (!iframe) {
      if (backup) backup.style.display = 'block';
      return;
    }

    // Timeout after which we consider ad unfilled (adjust ms as needed)
    var UNFILLED_TIMEOUT = 2500;

    var checked = false;
    function showBackup() {
      if (checked) return;
      checked = true;
      if (backup) backup.style.display = 'block';
      // optionally hide iframe/container to avoid blank space
      // adSpace.style.display = 'block';
    }

    // On load of iframe, do a quick check
    iframe.addEventListener('load', function () {
      try {
        // Heuristic: check iframe height and bounding box
        var h = iframe.offsetHeight || iframe.clientHeight;
        if (!h || h < 50) {
          showBackup();
        } else {
          // also check if the iframe contains about:blank or an empty src
          var src = iframe.getAttribute('src') || '';
          if (src.indexOf('pagead/ads') === -1 || src.indexOf('empty') !== -1) {
            showBackup();
          } else {
            // Looks like an ad was loaded. hide backup if visible.
            if (backup) backup.style.display = 'none';
          }
        }
      } catch (e) {
        // cross-origin frames can't be inspected; fall back to a conservative approach
        // leave the iframe alone and hide backup, or show backup after timeout below
      }
    }, {passive:true});

    // After timeout, if no visible creative, show backup
    setTimeout(function () {
      // If iframe still tiny or not showing, show backup
      var h = iframe.offsetHeight || iframe.clientHeight;
      if (!h || h < 50) showBackup();
    }, UNFILLED_TIMEOUT);

    // Also reveal backup if iframe never loads (network error)
    iframe.addEventListener('error', showBackup, {passive:true});
  });
});

