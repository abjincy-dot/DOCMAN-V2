package com.docman;

import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Message;
import android.os.Messenger;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import android.os.SystemClock;
import android.util.Log;

import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Reads a PDF's text with pdfium's text API, IN ITS OWN PROCESS (:pdftext).
 *
 * Two reasons it cannot run in the app process:
 *
 *  1. Symbol clash. The viewer ships its own pdfium (libmodpdfium.so via
 *     libjniPdfium.so) and this text API ships another (libpdfium.so). Both
 *     export the same FPDF_* symbols, so the dynamic linker bound the viewer's
 *     calls into the wrong library: closing a document after a search
 *     segfaulted inside nativeCloseDocument. Separate processes never share a
 *     linker namespace, so each library keeps its own pdfium.
 *
 *  2. Blast radius. A malformed 300 MB file that kills this process leaves the
 *     viewer running; the app just reports that the search failed.
 *
 * Results are handed back as a file (one length-prefixed UTF-8 string per
 * page) rather than through Binder, whose transaction buffer is ~1 MB and far
 * too small for a whole document's text.
 */
public class PdfTextService extends Service {

    public static final int MSG_START = 1;      // client -> service: extract
    public static final int MSG_CANCEL = 2;     // client -> service: stop now
    public static final int MSG_PROGRESS = 3;   // service -> client: arg1/arg2 pages
    public static final int MSG_DONE = 4;       // service -> client: KEY_RESULT_PATH
    public static final int MSG_ERROR = 5;      // service -> client: KEY_ERROR
    public static final int MSG_MATCH = 6;      // service -> client: arg1 = page index
    public static final int MSG_PAGE_LAYOUT = 7;    // client -> service: one page's char boxes
    public static final int MSG_LAYOUT_DONE = 8;    // service -> client: KEY_CHARS/KEY_BOXES/size
    public static final int MSG_OCR_SWEEP = 9;      // client -> service: read drawings as images
    public static final int MSG_SWEEP_DONE = 10;    // service -> client: KEY_RESULT_PATH (page texts)

    public static final String KEY_PDF_PATH = "pdfPath";
    public static final String KEY_PASSWORD = "password";
    public static final String KEY_RESULT_PATH = "resultPath";
    public static final String KEY_ERROR = "error";
    public static final String KEY_QUERY = "query";
    public static final String KEY_PAGE = "page";
    public static final String KEY_CHARS = "chars";       // the page's text, one entry per box
    public static final String KEY_BOXES = "boxes";       // x, yTop, w, h per character, in points
    public static final String KEY_PAGE_W = "pageW";
    public static final String KEY_PAGE_H = "pageH";
    public static final String KEY_MATCH_BOX = "matchBox";   // x, yTop, w, h of the hit, in points
    public static final String KEY_PAGES = "pages";          // which pages to read as images
    public static final String KEY_SCALE = "scale";          // render px per PDF point

    private static final String TAG = "PdfTextService";

    private volatile boolean cancelled = false;
    // Stepping through search hits asks for one page at a time, and each
    // request used to reopen the whole document: on a 900-page drawing set
    // that reopen, not the page itself, was the delay. The open document is
    // kept for the next request and only swapped when the file changes.
    private io.legere.pdfiumandroid.PdfDocument openDoc;
    private ParcelFileDescriptor openPfd;
    private String openPath;
    private Handler worker;
    private Handler pageWorker;
    private java.util.concurrent.ExecutorService pagePool;
    private Messenger messenger;

    @Override
    public void onCreate() {
        super.onCreate();
        HandlerThread thread = new HandlerThread("pdftext-worker");
        thread.start();
        worker = new Handler(thread.getLooper());
        // A second thread for single-page requests, so they are answered while
        // a whole-document text pass is still running.
        HandlerThread pageThread = new HandlerThread("pdftext-page");
        pageThread.start();
        pageWorker = new Handler(pageThread.getLooper());
        // Several viewer threads ask for pages at once during a drawing sweep;
        // answering them one at a time made those workers queue behind it.
        pagePool = java.util.concurrent.Executors.newFixedThreadPool(3);
        // ML Kit sets itself up from a ContentProvider, and that only runs in
        // the app's main process -- in here its recognizer threw
        // "MlKitContext has not been initialized". Do it by hand.
        try {
            com.google.mlkit.common.sdkinternal.MlKitContext.initializeIfNeeded(getApplicationContext());
        } catch (Throwable e) {
            Log.w(TAG, "ML Kit init failed", e);
        }
        messenger = new Messenger(new Handler(new Handler.Callback() {
            @Override
            public boolean handleMessage(Message msg) {
                if (msg.what == MSG_CANCEL) {
                    cancelled = true;
                    return true;
                }
                if (msg.what == MSG_PAGE_LAYOUT) {
                    final Messenger reply = msg.replyTo;
                    final Bundle data = msg.getData();
                    pagePool.execute(new Runnable() {
                        @Override
                        public void run() {
                            pageLayout(data.getString(KEY_PDF_PATH), data.getString(KEY_PASSWORD),
                                    data.getInt(KEY_PAGE, 0), reply);
                        }
                    });
                    return true;
                }
                if (msg.what == MSG_OCR_SWEEP) {
                    cancelled = false;
                    final Messenger reply = msg.replyTo;
                    final Bundle data = msg.getData();
                    worker.post(new Runnable() {
                        @Override
                        public void run() {
                            ocrSweep(data.getString(KEY_PDF_PATH), data.getString(KEY_PASSWORD),
                                    data.getString(KEY_QUERY), data.getIntArray(KEY_PAGES),
                                    data.getFloat(KEY_SCALE, 1.8f), reply);
                        }
                    });
                    return true;
                }
                if (msg.what == MSG_START) {
                    cancelled = false;
                    final Messenger reply = msg.replyTo;
                    final Bundle data = msg.getData();
                    worker.post(new Runnable() {
                        @Override
                        public void run() {
                            extract(data.getString(KEY_PDF_PATH), data.getString(KEY_PASSWORD),
                                    data.getString(KEY_QUERY), reply);
                        }
                    });
                    return true;
                }
                return false;
            }
        }));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return messenger.getBinder();
    }

    private void send(Messenger reply, int what, int arg1, int arg2, Bundle data) {
        if (reply == null) return;
        try {
            Message m = Message.obtain(null, what, arg1, arg2);
            if (data != null) m.setData(data);
            reply.send(m);
        } catch (RemoteException e) {
            // The viewer went away: stop working for a client that is gone.
            cancelled = true;
        }
    }

    private void extract(String pdfPath, String password, String query, Messenger reply) {
        final String needle = (query == null || query.isEmpty()) ? null : query.toLowerCase();
        ParcelFileDescriptor countPfd = null;
        io.legere.pdfiumandroid.PdfDocument countDoc = null;
        DataOutputStream out = null;
        File result = null;
        try {
            final File file = new File(pdfPath);
            countPfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            countDoc = openDocument(countPfd, password);
            final int pageCount = countDoc.getPageCount();
            try { countDoc.close(); } catch (Throwable ignored) { }
            countDoc = null;
            try { countPfd.close(); } catch (Throwable ignored) { }
            countPfd = null;

            // Reading 2000 pages one after another is what made the percentage
            // crawl. pdfium serialises calls on a single document, so each
            // worker opens the file for itself and takes one slice of the pages.
            final int workers = pageCount < 40 ? 1
                    : Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() - 2));
            final String[] texts = new String[pageCount];
            final java.util.concurrent.atomic.AtomicInteger doneCount =
                    new java.util.concurrent.atomic.AtomicInteger();
            final java.util.concurrent.atomic.AtomicLong lastReport =
                    new java.util.concurrent.atomic.AtomicLong();
            final Messenger replyTo = reply;
            final String pw = password;
            java.util.concurrent.ExecutorService pool =
                    java.util.concurrent.Executors.newFixedThreadPool(workers);
            final int chunk = (pageCount + workers - 1) / workers;
            long tStart = SystemClock.uptimeMillis();
            for (int w = 0; w < workers; w++) {
                final int from = w * chunk;
                final int to = Math.min(pageCount, from + chunk);
                if (from >= to) continue;
                pool.execute(new Runnable() {
                    @Override
                    public void run() {
                        ParcelFileDescriptor pfd = null;
                        io.legere.pdfiumandroid.PdfDocument doc = null;
                        try {
                            pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                            doc = openDocument(pfd, pw);
                            for (int i = from; i < to; i++) {
                                if (cancelled) return;
                                texts[i] = readPage(doc, i, needle, replyTo);
                                int done = doneCount.incrementAndGet();
                                long now = SystemClock.uptimeMillis();
                                if (now - lastReport.get() > 120 || done == pageCount) {
                                    lastReport.set(now);
                                    send(replyTo, MSG_PROGRESS, done, pageCount, null);
                                }
                            }
                        } catch (Throwable e) {
                            Log.w(TAG, "worker failed", e);
                        } finally {
                            if (doc != null) { try { doc.close(); } catch (Throwable ignored) { } }
                            if (pfd != null) { try { pfd.close(); } catch (Throwable ignored) { } }
                        }
                    }
                });
            }
            pool.shutdown();
            pool.awaitTermination(6, java.util.concurrent.TimeUnit.HOURS);
            if (cancelled) return;   // the client already moved on
            Log.d(TAG, "read " + pageCount + " pages on " + workers + " workers in "
                    + (SystemClock.uptimeMillis() - tStart) + "ms");

            result = new File(getCacheDir(), "pdftext_" + System.currentTimeMillis() + ".bin");
            out = new DataOutputStream(new java.io.BufferedOutputStream(new FileOutputStream(result), 64 * 1024));
            out.writeInt(pageCount);
            for (int i = 0; i < pageCount; i++) {
                byte[] bytes = (texts[i] == null ? "" : texts[i]).getBytes("UTF-8");
                out.writeInt(bytes.length);
                out.write(bytes);
            }
            out.flush();
            closeQuietly(out); out = null;

            Bundle data = new Bundle();
            data.putString(KEY_RESULT_PATH, result.getAbsolutePath());
            send(reply, MSG_DONE, 0, 0, data);
            result = null;   // handed over; the client deletes it
        } catch (Throwable e) {
            Log.w(TAG, "extraction failed", e);
            Bundle data = new Bundle();
            data.putString(KEY_ERROR, e.getClass().getSimpleName());
            send(reply, MSG_ERROR, 0, 0, data);
        } finally {
            closeQuietly(out);
            if (result != null) result.delete();
            if (countDoc != null) { try { countDoc.close(); } catch (Throwable ignored) { } }
            if (countPfd != null) { try { countPfd.close(); } catch (Throwable ignored) { } }
        }
    }

    // Reads a list of pages AS IMAGES and recognises their text, here in the
    // helper process. The viewer's own pdfium serialises every render behind one
    // process-wide lock, so doing this in the app meant the pages could only be
    // drawn one at a time however many workers were reading them. This engine
    // locks per document, so each worker opens its own and they render in
    // parallel. Matches (with their box) are sent as they are found, and the
    // recognised text comes back at the end for the viewer to remember.
    private void ocrSweep(final String pdfPath, final String password, String query,
                          int[] pageList, final float scale, final Messenger reply) {
        final String needle = (query == null || query.isEmpty()) ? null : query.toLowerCase();
        if (pageList == null || pageList.length == 0) {
            send(reply, MSG_SWEEP_DONE, 0, 0, null);
            return;
        }
        final int[] pages = pageList;
        final File file = new File(pdfPath);
        final String[] texts = new String[pages.length];
        final java.util.concurrent.atomic.AtomicInteger next = new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicInteger done = new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicLong lastReport = new java.util.concurrent.atomic.AtomicLong();
        final int workers = Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() - 2));
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(workers);
        long tStart = SystemClock.uptimeMillis();
        for (int w = 0; w < workers; w++) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    ParcelFileDescriptor pfd = null;
                    io.legere.pdfiumandroid.PdfDocument doc = null;
                    try {
                        pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                        doc = openDocument(pfd, password);
                        com.google.mlkit.vision.text.TextRecognizer rec = sweepRecognizer();
                        while (!cancelled) {
                            int slot = next.getAndIncrement();
                            if (slot >= pages.length) break;
                            int pageIndex = pages[slot];
                            texts[slot] = ocrOnePage(doc, rec, pageIndex, scale, needle, reply);
                            int n = done.incrementAndGet();
                            long now = SystemClock.uptimeMillis();
                            if (now - lastReport.get() > 150 || n == pages.length) {
                                lastReport.set(now);
                                send(reply, MSG_PROGRESS, n, pages.length, null);
                            }
                        }
                    } catch (Throwable e) {
                        Log.w(TAG, "sweep worker failed", e);
                    } finally {
                        if (doc != null) { try { doc.close(); } catch (Throwable ignored) { } }
                        if (pfd != null) { try { pfd.close(); } catch (Throwable ignored) { } }
                    }
                }
            });
        }
        pool.shutdown();
        try {
            pool.awaitTermination(6, java.util.concurrent.TimeUnit.HOURS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        if (cancelled) return;
        Log.d(TAG, "ocr sweep: " + pages.length + " pages on " + workers + " workers in "
                + (SystemClock.uptimeMillis() - tStart) + "ms");

        // Hand the recognised text back as a file: page index then text, so the
        // viewer can keep it and never sweep this document again.
        File result = null;
        DataOutputStream out = null;
        try {
            result = new File(getCacheDir(), "pdfocr_" + System.currentTimeMillis() + ".bin");
            out = new DataOutputStream(new java.io.BufferedOutputStream(new FileOutputStream(result), 64 * 1024));
            out.writeInt(pages.length);
            for (int i = 0; i < pages.length; i++) {
                out.writeInt(pages[i]);
                byte[] b = (texts[i] == null ? "" : texts[i]).getBytes("UTF-8");
                out.writeInt(b.length);
                out.write(b);
            }
            out.flush();
            closeQuietly(out); out = null;
            Bundle data = new Bundle();
            data.putString(KEY_RESULT_PATH, result.getAbsolutePath());
            send(reply, MSG_SWEEP_DONE, 0, 0, data);
            result = null;
        } catch (Throwable e) {
            send(reply, MSG_SWEEP_DONE, 0, 0, null);
        } finally {
            closeQuietly(out);
            if (result != null) result.delete();
        }
    }

    private com.google.mlkit.vision.text.TextRecognizer sharedRec;

    private synchronized com.google.mlkit.vision.text.TextRecognizer sweepRecognizer() {
        if (sharedRec == null) {
            sharedRec = com.google.mlkit.vision.text.TextRecognition.getClient(
                    com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS);
        }
        return sharedRec;
    }

    private String ocrOnePage(io.legere.pdfiumandroid.PdfDocument doc,
                              com.google.mlkit.vision.text.TextRecognizer rec,
                              int pageIndex, float scale, String needle, Messenger reply) {
        io.legere.pdfiumandroid.PdfPage page = null;
        android.graphics.Bitmap bitmap = null;
        try {
            page = doc.openPage(pageIndex);
            float pageW = page.getPageWidthPoint();
            float pageH = page.getPageHeightPoint();
            if (pageW <= 0 || pageH <= 0) return "";
            int outW = Math.max(1, Math.round(pageW * scale));
            int outH = Math.max(1, Math.round(pageH * scale));
            bitmap = android.graphics.Bitmap.createBitmap(outW, outH, android.graphics.Bitmap.Config.ARGB_8888);
            page.renderPageBitmap(bitmap, 0, 0, outW, outH, true, false);
            com.google.mlkit.vision.common.InputImage image =
                    com.google.mlkit.vision.common.InputImage.fromBitmap(bitmap, 0);
            com.google.mlkit.vision.text.Text result =
                    com.google.android.gms.tasks.Tasks.await(rec.process(image));
            if (result == null) return "";
            StringBuilder all = new StringBuilder();
            for (com.google.mlkit.vision.text.Text.TextBlock block : result.getTextBlocks()) {
                for (com.google.mlkit.vision.text.Text.Line line : block.getLines()) {
                    for (com.google.mlkit.vision.text.Text.Element el : line.getElements()) {
                        String word = el.getText();
                        if (word == null || word.isEmpty()) continue;
                        all.append(word).append(' ');
                        if (needle != null && word.toLowerCase().contains(needle)) {
                            android.graphics.Rect r = el.getBoundingBox();
                            Bundle hit = null;
                            if (r != null) {
                                // Recognised boxes are in bitmap pixels; the
                                // viewer works in PDF points.
                                hit = new Bundle();
                                hit.putFloatArray(KEY_MATCH_BOX, new float[]{
                                        r.left / scale, r.top / scale,
                                        r.width() / scale, r.height() / scale });
                                hit.putFloat(KEY_PAGE_W, pageW);
                                hit.putFloat(KEY_PAGE_H, pageH);
                            }
                            send(reply, MSG_MATCH, pageIndex, 0, hit);
                        }
                    }
                }
            }
            return all.toString().trim();
        } catch (Throwable e) {
            return "";
        } finally {
            if (bitmap != null) { try { bitmap.recycle(); } catch (Throwable ignored) { } }
            if (page != null) { try { page.close(); } catch (Throwable ignored) { } }
        }
    }

    private io.legere.pdfiumandroid.PdfDocument openDocument(ParcelFileDescriptor pfd, String password)
            throws java.io.IOException {
        io.legere.pdfiumandroid.util.Config cfg = new io.legere.pdfiumandroid.util.Config(
                new io.legere.pdfiumandroid.DefaultLogger(),
                io.legere.pdfiumandroid.util.AlreadyClosedBehavior.IGNORE);
        io.legere.pdfiumandroid.PdfiumCore core = new io.legere.pdfiumandroid.PdfiumCore(this, cfg);
        return (password == null || password.isEmpty())
                ? core.newDocument(pfd) : core.newDocument(pfd, password);
    }

    // One page of text, plus -- when it matches -- the hit's own box, measured
    // WHILE the page is still open. An earlier version measured it after
    // closing the page, which quietly produced nothing, so the viewer jumped to
    // a page it could not yet highlight.
    private String readPage(io.legere.pdfiumandroid.PdfDocument doc, int index,
                            String needle, Messenger reply) {
        String text = "";
        io.legere.pdfiumandroid.PdfPage page = null;
        io.legere.pdfiumandroid.PdfTextPage textPage = null;
        try {
            page = doc.openPage(index);
            textPage = page.openTextPage();
            int chars = textPage.textPageCountChars();
            if (chars > 0) text = textPage.textPageGetText(0, chars);
            if (text == null) text = "";
            if (needle != null && text.toLowerCase().contains(needle)) {
                Bundle hit = null;
                try {
                    int at = text.toLowerCase().indexOf(needle);
                    float pageW = page.getPageWidthPoint(), pageH = page.getPageHeightPoint();
                    final int SUB = 4;
                    int devW = Math.max(1, Math.round(pageW * SUB));
                    int devH = Math.max(1, Math.round(pageH * SUB));
                    float l = Float.MAX_VALUE, t = Float.MAX_VALUE, r = -Float.MAX_VALUE, b = -Float.MAX_VALUE;
                    for (int k = at; k < at + needle.length(); k++) {
                        android.graphics.RectF cb = textPage.textPageGetCharBox(k);
                        if (cb == null) continue;
                        android.graphics.Rect d = page.mapRectToDevice(0, 0, devW, devH, 0, cb);
                        if (d == null) continue;
                        l = Math.min(l, Math.min(d.left, d.right) / (float) SUB);
                        t = Math.min(t, Math.min(d.top, d.bottom) / (float) SUB);
                        r = Math.max(r, Math.max(d.left, d.right) / (float) SUB);
                        b = Math.max(b, Math.max(d.top, d.bottom) / (float) SUB);
                    }
                    if (r > l && b > t) {
                        hit = new Bundle();
                        hit.putFloatArray(KEY_MATCH_BOX, new float[]{ l, t, r - l, b - t });
                        hit.putFloat(KEY_PAGE_W, pageW);
                        hit.putFloat(KEY_PAGE_H, pageH);
                    }
                } catch (Throwable ignored) {
                    // Fall back to a page-only match.
                }
                send(reply, MSG_MATCH, index, 0, hit);
            }
        } catch (Throwable pageErr) {
            // One bad page must not cost the rest of the document.
        } finally {
            if (textPage != null) { try { textPage.close(); } catch (Throwable ignored) { } }
            if (page != null) { try { page.close(); } catch (Throwable ignored) { } }
        }
        return text;
    }

    // One page's character boxes, for search highlighting and text selection.
    // Same reason as the text pass: PDFBox had to parse the whole document
    // before it could report a single character's position, which is what made
    // jumping to a search hit pause on a large file.
    private void pageLayout(String pdfPath, String password, int pageIndex, Messenger reply) {
        io.legere.pdfiumandroid.PdfPage page = null;
        io.legere.pdfiumandroid.PdfTextPage textPage = null;
        try {
            io.legere.pdfiumandroid.PdfDocument doc = documentFor(pdfPath, password);
            page = doc.openPage(pageIndex);
            textPage = page.openTextPage();
            final float pageW = page.getPageWidthPoint();
            final float pageH = page.getPageHeightPoint();
            int count = Math.min(textPage.textPageCountChars(), 40000);
            StringBuilder chars = new StringBuilder(Math.max(0, count));
            float[] boxes = new float[Math.max(0, count) * 4];
            int kept = 0;
            // Let pdfium map each box onto the page as DRAWN. Doing the flip by
            // hand (pageH - top) ignored the page's own /Rotate, so on rotated
            // sheets -- which is most of a CAD set -- the highlight landed in
            // the wrong place. SUB is an oversampling factor: mapRectToDevice
            // returns integers, so mapping into a 4x grid keeps sub-point
            // precision, and the coordinates are divided back down after.
            final int SUB = 4;
            final int devW = Math.max(1, Math.round(pageW * SUB));
            final int devH = Math.max(1, Math.round(pageH * SUB));
            for (int i = 0; i < count; i++) {
                android.graphics.RectF r = textPage.textPageGetCharBox(i);
                String ch = textPage.textPageGetText(i, 1);
                if (r == null || ch == null || ch.isEmpty()) continue;
                android.graphics.Rect d = page.mapRectToDevice(0, 0, devW, devH, 0, r);
                if (d == null) continue;
                float left = Math.min(d.left, d.right) / (float) SUB;
                float top = Math.min(d.top, d.bottom) / (float) SUB;
                float w = Math.abs(d.right - d.left) / (float) SUB;
                float h = Math.abs(d.bottom - d.top) / (float) SUB;
                boxes[kept * 4] = left;
                boxes[kept * 4 + 1] = top;
                boxes[kept * 4 + 2] = w;
                boxes[kept * 4 + 3] = h;
                chars.append(ch.charAt(0));
                kept++;
            }
            float[] trimmed = new float[kept * 4];
            System.arraycopy(boxes, 0, trimmed, 0, kept * 4);
            Bundle out = new Bundle();
            out.putString(KEY_CHARS, chars.toString());
            out.putFloatArray(KEY_BOXES, trimmed);
            out.putFloat(KEY_PAGE_W, pageW);
            out.putFloat(KEY_PAGE_H, pageH);
            send(reply, MSG_LAYOUT_DONE, pageIndex, kept, out);
        } catch (Throwable e) {
            Log.w(TAG, "page layout failed", e);
            Bundle data = new Bundle();
            data.putString(KEY_ERROR, e.getClass().getSimpleName());
            send(reply, MSG_ERROR, 0, 0, data);
        } finally {
            if (textPage != null) { try { textPage.close(); } catch (Throwable ignored) { } }
            if (page != null) { try { page.close(); } catch (Throwable ignored) { } }
            // The document itself stays open for the next page request.
        }
    }

    // synchronized: the page pool calls this from several threads at once, and
    // unsynchronised they raced -- one thread closed the descriptor another was
    // opening, so page requests failed with "Already closed" and the drawing
    // sweep silently skipped those pages.
    private synchronized io.legere.pdfiumandroid.PdfDocument documentFor(String pdfPath, String password) throws Exception {
        if (openDoc != null && pdfPath.equals(openPath)) return openDoc;
        closeOpenDocument();
        openPfd = ParcelFileDescriptor.open(new File(pdfPath), ParcelFileDescriptor.MODE_READ_ONLY);
        io.legere.pdfiumandroid.util.Config cfg = new io.legere.pdfiumandroid.util.Config(
                new io.legere.pdfiumandroid.DefaultLogger(),
                io.legere.pdfiumandroid.util.AlreadyClosedBehavior.IGNORE);
        io.legere.pdfiumandroid.PdfiumCore core = new io.legere.pdfiumandroid.PdfiumCore(this, cfg);
        try {
            openDoc = (password == null || password.isEmpty())
                    ? core.newDocument(openPfd) : core.newDocument(openPfd, password);
        } catch (Throwable e) {
            // Leave nothing half-open for the next caller to trip over.
            closeOpenDocument();
            throw e;
        }
        openPath = pdfPath;
        return openDoc;
    }

    private synchronized void closeOpenDocument() {
        if (openDoc != null) { try { openDoc.close(); } catch (Throwable ignored) { } openDoc = null; }
        if (openPfd != null) { try { openPfd.close(); } catch (Throwable ignored) { } openPfd = null; }
        openPath = null;
    }

    @Override
    public void onDestroy() {
        if (pagePool != null) pagePool.shutdownNow();
        closeOpenDocument();
        super.onDestroy();
    }

    private void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try { c.close(); } catch (Throwable ignored) { }
    }
}
