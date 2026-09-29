// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfViewerActivity.java
//
// Replace "com.docman" with YOUR app's real package name.

package com.docman;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.os.Message;
import android.os.Messenger;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import android.os.SystemClock;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.MimeTypeMap;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.github.barteksc.pdfviewer.PDFView;
import com.github.barteksc.pdfviewer.listener.OnLoadCompleteListener;
import com.github.barteksc.pdfviewer.listener.OnPageChangeListener;
import com.github.barteksc.pdfviewer.scroll.DefaultScrollHandle;
import com.github.barteksc.pdfviewer.util.FitPolicy;
import com.shockwave.pdfium.PdfDocument;
import com.shockwave.pdfium.PdfiumCore;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.io.MemoryUsageSetting;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.pdmodel.PDDocumentNameDictionary;
import com.tom_roush.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import com.tom_roush.pdfbox.pdmodel.PDPage;
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream;
import com.tom_roush.pdfbox.pdmodel.common.PDNameTreeNode;
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle;
import com.tom_roush.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import com.tom_roush.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import com.tom_roush.pdfbox.pdmodel.common.filespecification.PDFileSpecification;
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDColor;
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject;
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationTextMarkup;
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDAcroForm;
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDCheckBox;
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDField;
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDTextField;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import com.tom_roush.pdfbox.text.TextPosition;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PdfViewerActivity extends AppCompatActivity {

    private PDFView pdfView;
    private FrameLayout pdfContainer;
    private PdfMarkOverlayView markOverlay;
    private ImageView markBtn;
    private ImageButton bookmarkBtn;
    private ImageView bookmarkPageBtn;
    private TextView pageIndicator;
    private View toolbar;
    private View secondaryBar;
    // Flattened table of contents -- index in these two lists lines up,
    // so a tap on displayTitles[i] jumps to flatBookmarks[i].getPageIdx().
    private final List<PdfDocument.Bookmark> flatBookmarks = new ArrayList<>();
    private final List<String> flatBookmarkTitles = new ArrayList<>();
    private int rotationDegrees = 0; // 0, 90, 180, 270 — visual rotation only
    // Re-entry guard for the blur-fix redraw below -- prevents it from
    // triggering itself in a loop (that's what caused the earlier
    // auto-scrolling bug: an ANIMATED jumpTo passes through intermediate
    // pages, each of which re-fires onPageChanged).
    private boolean isHandlingPageChange = false;

    // Same "nudge a redraw" idea as blurFixOnPageChange below, but for the
    // case the user is reporting: zooming/panning WITHIN a page can leave a
    // low-res placeholder tile on screen until the view goes idle. This
    // polls the current zoom/scroll offsets on a timer (no touch-listener
    // involved, so it can't interfere with the library's own pinch/pan
    // handling) and fires a redraw nudge once things stop changing for a
    // couple of ticks. Uses setPositionOffset(getPositionOffset(), false)
    // rather than jumpTo() -- jumpTo(page, false) always snaps to that
    // page's TOP edge (it computes offset from pdfFile.getPageOffset(page,
    // zoom), which is page-relative, not the actual current scroll
    // position), so it was yanking the view up to the top of the current
    // page after every pinch-zoom/pan, discarding wherever the user had
    // scrolled to within it. setPositionOffset reconstructs the exact
    // current scroll offset from a 0..1 document-wide progress value, so
    // re-applying it forces the same tile reload/redraw at the position
    // the user is actually looking at.
    private boolean zoomScrollIdlePollerStarted = false;
    private float lastPolledZoom = -1f;
    private float lastPolledXOffset = Float.MIN_VALUE;
    private float lastPolledYOffset = Float.MIN_VALUE;
    private boolean pendingIdleNudge = false;

    // Continue Reading — stable per-document key (folderPath + fileName from
    // JS), NOT the reusable cache `path`. Empty when the caller didn't pass
    // one (older JS bundle, or a share/external flow) — in that case
    // progress is simply not saved, no crash.
    private boolean isPro = true;
    // Pro tools that still have their one free try (only consulted when !isPro).
    private final Set<String> freeTries = new HashSet<>();
    private final Set<String> freeTryNoticeShown = new HashSet<>();
    private final Map<String, TextView> toolTryBadges = new java.util.HashMap<>();
    // Set once this visit's scanned-pages search has spent the OCR try, so
    // text selection on scanned pages keeps working until the viewer closes.
    private volatile boolean ocrUnlockedThisVisit = false;
    private String docId = "";
    private volatile int lastKnownPage = 0;
    private int lastKnownPageCount = 0;
    static final String PROGRESS_PREFS = PdfNativePlugin.PROGRESS_PREFS;

    // Viewer-wide preferences (night mode, horizontal scroll) — deliberately
    // NOT per-document like Continue Reading; these are reading preferences
    // the person sets once and expects every PDF to honor afterward.
    private static final String VIEWER_PREFS = "docman_pdf_viewer_settings";
    private boolean nightModeEnabled = false;
    private boolean horizontalScrollEnabled = false;
    // Two-Page View forces horizontal layout (see loadPdf()'s effectiveHorizontal)
    // and zooms out to TWO_PAGE_ZOOM so consecutive pages sit side by side in
    // the same continuous strip -- not a book-style odd/even spread, just two
    // pages' worth of the normal horizontal scroll visible at once.
    private boolean twoPageViewEnabled = false;
    private static final float TWO_PAGE_ZOOM = 0.5f;
    private static final float TWO_PAGE_ZOOM_SENTINEL = -2f;

    // User-created page bookmarks (distinct from the PDF's own embedded
    // table-of-contents bookmarks above) — per document, stored as a
    // comma-separated set of 0-based page indices.
    private static final String USER_BOOKMARKS_PREFS = "docman_pdf_user_bookmarks";
    private final Set<Integer> bookmarkedPages = new HashSet<>();

    // Raw path/title/initial-restore values captured once in onCreate so
    // loadPdf() can be re-invoked (night mode / scroll direction toggles
    // both require a full reload — the library only reads these at load
    // time) without re-reading the Intent each time.
    private String pdfPath;
    private String pdfTitle;
    private boolean isFullScreen = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExecutorService thumbnailExecutor;
    // Search work only, so it cannot be blocked by prefetch/OCR jobs.
    private ExecutorService searchExecutor;

    // In-document text search (page-level: jumps to the page, no on-page
    // highlight). Extracted once per document via PdfBox (the pdfium build
    // used for rendering has no text-extraction API) and cached for the rest
    // of this Activity's lifetime, since pdfPath never changes after onCreate.
    private List<String> pageTextsCache = null;

    // Per-page character positions, extracted via PDFBox alongside (but
    // separately from) pageTextsCache above -- powers drag-to-select text
    // selection, which needs each character's own bounding box rather than
    // just the page's plain text. See PdfTextSelectionOverlayView for how
    // these get projected onto the screen and turned into a selectable range.
    private List<PageTextLayout> pageTextLayoutCache = null;
    // One PDDocument kept open for the rest of this Activity's lifetime,
    // reused by every ensurePageTextLayoutForPage() call instead of each one
    // re-opening (and re-parsing the whole document's xref/object table --
    // real cost on a large PDF) its own short-lived PDDocument the way
    // openPdDocumentForExtraction()'s other callers do. Opened lazily on
    // first use on the background executor thread; closed in onDestroy().
    private PDDocument textLayoutDoc = null;
    private PdfTextSelectionOverlayView textSelectionOverlay;
    private View selectionToolbar;
    private View copySelectionBtn;
    private View highlightSelectionBtn;
    private long lastTextNotReadyToastMs = 0;
    private boolean shownPreparingLargeDocToast = false;

    private PdfSignaturePlacementView signaturePlacementView;
    private View signatureConfirmBar;
    private PdfRedactOverlayView redactOverlay;
    private PdfCropOverlayView cropOverlay;
    private View bottomToolStrip;

    // One glyph's bounding box in raw PDF-point space (top-left origin,
    // y-down -- per PDFBox's own TextPosition.getXDirAdj()/getYDirAdj()
    // javadoc: "adjusted so 0,0 is upper left"). Not yet scaled to the
    // rendered page or the screen -- PdfTextSelectionOverlayView does that.
    static final class CharBox {
        final String ch;
        final float x, y, width, height;
        // True for an OCR-sourced entry (see ensurePageTextLayoutForPage's
        // OCR fallback) -- ch holds a whole WORD in that case, not one
        // character, since that's the granularity ML Kit's text recognizer
        // gives us. PdfTextSelectionOverlayView's word-boundary walk uses
        // this to treat each OCR entry as already a complete, non-mergeable
        // unit instead of trying to merge adjacent words the way it merges
        // adjacent single characters from real PDF text.
        final boolean wholeUnit;

        CharBox(String ch, float x, float y, float width, float height) {
            this(ch, x, y, width, height, false);
        }

        CharBox(String ch, float x, float y, float width, float height, boolean wholeUnit) {
            this.ch = ch;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.wholeUnit = wholeUnit;
        }
    }

    // One page's extracted characters plus the page's own as-displayed size
    // in PDF points (width/height swapped for a 90/270-rotated page, since
    // PDFBox's DirAdj coordinates are already adjusted for that rotation).
    // PdfTextSelectionOverlayView divides PDFView's rendered page size by
    // this to get the PDF-point -> screen-pixel scale factor.
    static final class PageTextLayout {
        // True when this layout holds only a search hit's own characters.
        boolean partial;
        boolean rebuildQueued;
        // A prefetch stores real text only (reading a page as an image is far
        // too slow to do for every page passed). A later highlight or text
        // selection on a drawing page must not mistake that for a finished
        // result, so it records whether OCR has actually run.
        boolean ocrDone;
        final List<CharBox> chars = new ArrayList<>();
        float pageWidthPts;
        float pageHeightPts;
    }

    // Files embedded in the PDF -- either document-level (the "Attachments"
    // panel most readers show) or attached to a specific page via a
    // FileAttachment annotation (the paperclip icon). Bytes are read out
    // eagerly at extraction time rather than keeping the PDFBox objects
    // around, since those are only valid while their PDDocument stays open.
    static final class AttachmentInfo {
        final String name;
        final byte[] data;
        AttachmentInfo(String name, byte[] data) {
            this.name = name;
            this.data = data;
        }
    }
    private List<AttachmentInfo> attachmentsCache = null;

    // Adobe-Reader-style search nav: a floating "N of M" pill with prev/next
    // that steps through matchPages in place, rather than a results list the
    // person has to reopen/re-scroll for every match.
    private View searchBar;
    private EditText searchInput;
    private ImageButton searchClearBtn;
    private TextView searchLabel;
    private ImageButton searchPrevBtn;
    private ImageButton searchNextBtn;
    private List<Integer> currentMatchPages = null;
    private int currentMatchIndex = 0;
    private android.app.AlertDialog deepSearchDialog;
    // Word-level position inside the current match page: prev/next walk
    // through every hit on a page before moving to the next page.
    private List<int[]> currentPageRanges = null;
    private int currentSearchPage = -1;
    private int currentRangeIndex = 0;
    private int currentPageRangeCount = 0;
    private boolean stepToLastRangeOnPage = false;
    private android.animation.ValueAnimator searchZoomAnimator;
    // Kept so a prev/next step can re-resolve where the word sits on the new
    // page -- page-level discovery alone doesn't carry that.
    private String lastSearchQuery = null;

    private static final int COLOR_INACTIVE = Color.parseColor("#E2E8F0");
    private static final int COLOR_ACTIVE = Color.parseColor("#FF4444");
    private static final int COLOR_BOOKMARKED = Color.parseColor("#FBBF24");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_pdf_viewer);

        PDFBoxResourceLoader.init(getApplicationContext());

        pdfView = findViewById(R.id.pdfView);
        pdfContainer = findViewById(R.id.pdfContainer);
        markOverlay = findViewById(R.id.pdfMarkOverlay);
        textSelectionOverlay = findViewById(R.id.pdfTextSelectionOverlay);
        textSelectionOverlay.setPdfView(pdfView);
        selectionToolbar = findViewById(R.id.pdfSelectionToolbar);
        copySelectionBtn = findViewById(R.id.pdfCopySelectionBtn);
        highlightSelectionBtn = findViewById(R.id.pdfHighlightSelectionBtn);
        textSelectionOverlay.setOnSelectionListener(new PdfTextSelectionOverlayView.OnSelectionListener() {
            @Override
            public void onSelectionChanged(boolean hasSelection, float anchorX, float anchorY) {
                if (!hasSelection) {
                    selectionToolbar.setVisibility(View.GONE);
                    return;
                }
                selectionToolbar.setVisibility(View.VISIBLE);
                // Sits just above the selection's top-left corner; clamped so
                // it doesn't get pushed off the top edge on a first-line
                // selection, matching standard text-selection toolbar behavior.
                selectionToolbar.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
                float btnHeight = selectionToolbar.getMeasuredHeight();
                float ty = anchorY - btnHeight - dp(8);
                if (ty < 0) ty = anchorY + dp(8);
                selectionToolbar.setTranslationX(Math.max(0, anchorX));
                selectionToolbar.setTranslationY(Math.max(0, ty));
            }

            @Override
            public void onTextNotReady() {
                // Throttled -- otherwise holding a finger down repeatedly
                // while extraction is still running queues up a stack of
                // toasts instead of showing one useful message.
                long now = System.currentTimeMillis();
                if (now - lastTextNotReadyToastMs > 3000) {
                    lastTextNotReadyToastMs = now;
                    showNotice(NOTICE_INFO, "Still preparing the text", "Try again in a moment");
                }
            }

            @Override
            public void onPageTextNeeded(final int pageIndex, final float touchX, final float touchY) {
                // One-time, not per-attempt: the slow part is the document's
                // first parse (textLayoutDoc == null), which can take a
                // while on a large file -- once that's done every page is
                // fast, so there's nothing more to warn about even if this
                // particular page still needs its own (quick) extraction.
                boolean pageNotRead = pageTextLayoutCache == null || pageIndex < 0
                        || pageIndex >= pageTextLayoutCache.size() || pageTextLayoutCache.get(pageIndex) == null;
                if (pageNotRead && textLayoutDoc == null && !isTooLargeForPdfBox() && !shownPreparingLargeDocToast) {
                    shownPreparingLargeDocToast = true;
                    showNotice(NOTICE_INFO, "Preparing text selection", "Large files can take 10–15 seconds the first time");
                }
                ensurePageTextLayoutForPage(pageIndex, new Runnable() {
                    @Override
                    public void run() {
                        textSelectionOverlay.retrySelectionAt(touchX, touchY);
                    }
                });
            }

            @Override
            public void onNoTextAt(int pageIndex) {
                long now = System.currentTimeMillis();
                if (now - lastTextNotReadyToastMs < 3000) return;
                lastTextNotReadyToastMs = now;
                if (isPro || ocrUnlockedThisVisit) {
                    showNotice(NOTICE_INFO, "No text here", "Press and hold on a word to select it");
                } else {
                    // Drawings and scans carry their labels as lines or
                    // pixels; only the OCR pass (a Pro tool) can read them.
                    showNotice(NOTICE_INFO, "This text is part of the drawing",
                            "DOCMAN Pro can read it so you can select and copy it");
                }
            }
        });
        copySelectionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = textSelectionOverlay.getSelectedText();
                textSelectionOverlay.clearSelection();
                if (text == null || text.trim().isEmpty()) {
                    showNotice(NOTICE_INFO, "Nothing to copy", "Select some text first");
                    return;
                }
                android.content.ClipboardManager clipboard =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Selected text", text));
                showNotice(NOTICE_OK, "Copied", "The selected text is ready to paste");
            }
        });
        highlightSelectionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!requireTool("highlight")) return;
                highlightSelection();
            }
        });

        signaturePlacementView = findViewById(R.id.pdfSignaturePlacementView);
        signaturePlacementView.setPdfView(pdfView);
        signatureConfirmBar = findViewById(R.id.pdfSignatureConfirmBar);
        findViewById(R.id.pdfSignatureCancelBtn).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                exitSignaturePlacementMode();
            }
        });
        findViewById(R.id.pdfSignaturePlaceBtn).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stampSignatureAndSave();
            }
        });

        redactOverlay = findViewById(R.id.pdfRedactOverlay);
        redactOverlay.setPdfView(pdfView);
        redactOverlay.setEraseListener(new PdfRedactOverlayView.EraseListener() {
            @Override
            public void onStrokesChanged() {
                updateEraseState();
            }

            @Override
            public void onPageSampleNeeded(int page) {
                renderEraseSample(page);
            }
        });

        cropOverlay = findViewById(R.id.pdfCropOverlay);
        cropOverlay.setPdfView(pdfView);
        cropOverlay.setOnCropAreaListener(new PdfCropOverlayView.OnCropAreaListener() {
            @Override
            public void onCropAreaMarked() {
                pdfView.setSwipeEnabled(true);
                bottomToolStrip.setVisibility(View.VISIBLE);
                confirmAndCrop();
            }
        });

        // Persistent bottom tool strip -- the 5 most-used tools plus More,
        // so common tools are one tap instead of two (More sheet still has
        // the rest, see showMoreMenu()).
        bottomToolStrip = findViewById(R.id.pdfBottomToolStrip);
        findViewById(R.id.pdfToolSearch).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSearchDialog();
            }
        });
        findViewById(R.id.pdfToolPages).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showThumbnailsDialog();
            }
        });
        findViewById(R.id.pdfToolSign).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!requireTool("sign")) return;
                showSignatureEntry();
            }
        });
        findViewById(R.id.pdfToolFillForm).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!requireTool("fillform")) return;
                showFormFillDialog();
            }
        });
        findViewById(R.id.pdfToolRedact).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!requireTool("redact")) return;
                enterEraseMode();
            }
        });
        findViewById(R.id.pdfToolMore).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showMoreMenu();
            }
        });

        TextView titleText = findViewById(R.id.pdfTitleText);
        ImageButton backBtn = findViewById(R.id.pdfBackBtn);
        View rotateBtn = findViewById(R.id.pdfToolRotate);
        markBtn = findViewById(R.id.pdfMarkBtn);
        final View markRow = findViewById(R.id.pdfToolMark);
        final View starRow = findViewById(R.id.pdfToolStar);
        markOverlay.setOnMarkAddedListener(new PdfMarkOverlayView.OnMarkAddedListener() {
            @Override
            public void onMarkAdded() {
                // Mirrors the overlay's own auto-exit (one mark per
                // activation) -- just needs to flip the button back to its
                // inactive color since the overlay already turned itself off.
                markBtn.setColorFilter(COLOR_INACTIVE, PorterDuff.Mode.SRC_IN);
                // The mark is screen-space-only (doesn't follow page content
                // -- see PdfMarkOverlayView's class comment), so scrolling
                // away from here would leave it circling the wrong thing.
                // Lock page scrolling until the mark is cleared.
                pdfView.setSwipeEnabled(false);
                textSelectionOverlay.setMarkModeActive(false);
            }
        });
        bookmarkBtn = findViewById(R.id.pdfBookmarkBtn);
        bookmarkPageBtn = findViewById(R.id.pdfBookmarkPageBtn);
        pageIndicator = findViewById(R.id.pdfPageIndicator);
        toolbar = findViewById(R.id.pdfToolbar);
        secondaryBar = findViewById(R.id.pdfSecondaryBar);

        searchBar = findViewById(R.id.pdfSearchBar);
        searchLabel = findViewById(R.id.pdfSearchLabel);
        searchPrevBtn = findViewById(R.id.pdfSearchPrevBtn);
        searchNextBtn = findViewById(R.id.pdfSearchNextBtn);
        findViewById(R.id.pdfSearchCloseBtn).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { closeSearchBar(); }
        });
        searchPrevBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { hideSearchKeyboard(); stepSearchMatch(-1); }
        });
        searchNextBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { hideSearchKeyboard(); stepSearchMatch(1); }
        });

        searchInput = findViewById(R.id.pdfSearchInput);
        searchClearBtn = findViewById(R.id.pdfSearchClearBtn);
        searchClearBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                stopSearchTicker();
                searchInput.setText("");
                searchLabel.setText("");
                setSearchStepEnabled(false);
                currentMatchPages = null; currentPageRanges = null; currentPageRangeCount = 0; currentRangeIndex = 0;
                if (textSelectionOverlay != null) textSelectionOverlay.clearSearchMatches();
                searchInput.requestFocus();
            }
        });
        // Search on the keyboard's action key, not on every keystroke: a
        // 205-page document re-scans on submit, which would be unusable if it
        // happened per character.
        searchInput.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, android.view.KeyEvent event) {
                if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
                        || (event != null && event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER
                                && event.getAction() == android.view.KeyEvent.ACTION_DOWN)) {
                    hideSearchKeyboard();
                    performSearch(searchInput.getText().toString());
                    return true;
                }
                return false;
            }
        });
        searchInput.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(android.text.Editable s) {
                searchClearBtn.setVisibility(s.length() > 0 ? View.VISIBLE : View.GONE);
            }
        });
        setSearchStepEnabled(false);

        // The toolbar's back/mark/bookmark/rotate row sits at layout_gravity="top"
        // with a fixed 4dp paddingTop from XML. On edge-to-edge (targetSdk 36
        // forces this), the toolbar draws UNDER the status bar instead of below
        // it, so that fixed 4dp isn't enough -- the back button ends up visually
        // clipped behind the clock/notification icons. Push the toolbar's top
        // padding out by the actual status bar inset (varies by device/notch/
        // camera-cutout) so the row always clears it, and shift the secondary
        // page-indicator bar down by the same amount so it stays right below
        // the now-taller toolbar instead of overlapping it.
        final int baseToolbarPaddingTop = dp(4);
        final int baseSecondaryBarMarginTop = dp(52);
        final int baseSignatureBarMarginBottom = dp(32);
        ViewCompat.setOnApplyWindowInsetsListener(toolbar, new androidx.core.view.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets statusBar = insets.getInsets(WindowInsetsCompat.Type.statusBars());
                v.setPadding(v.getPaddingLeft(), baseToolbarPaddingTop + statusBar.top,
                        v.getPaddingRight(), v.getPaddingBottom());
                if (secondaryBar != null && secondaryBar.getLayoutParams() instanceof FrameLayout.LayoutParams) {
                    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) secondaryBar.getLayoutParams();
                    lp.topMargin = baseSecondaryBarMarginTop + statusBar.top;
                    secondaryBar.setLayoutParams(lp);
                }
                if (searchBar != null && searchBar.getLayoutParams() instanceof FrameLayout.LayoutParams) {
                    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) searchBar.getLayoutParams();
                    lp.topMargin = baseSecondaryBarMarginTop + statusBar.top;
                    searchBar.setLayoutParams(lp);
                }
                // Edge-to-edge (see the comment above on the toolbar itself)
                // means content draws UNDER the system nav bar / gesture pill
                // by default too, not just the status bar -- without this the
                // Place/Cancel bar's fixed 32dp bottom margin got clipped
                // behind the gesture nav area on some devices.
                if (signatureConfirmBar != null && signatureConfirmBar.getLayoutParams() instanceof FrameLayout.LayoutParams) {
                    Insets navBar = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) signatureConfirmBar.getLayoutParams();
                    lp.bottomMargin = baseSignatureBarMarginBottom + navBar.bottom;
                    signatureConfirmBar.setLayoutParams(lp);
                }
                // Same edge-to-edge reasoning as the signature bar above --
                // pads the strip's own background down into the gesture nav
                // area (so there's no gap) while keeping the icons/labels
                // themselves clear of it.
                if (bottomToolStrip != null) {
                    Insets navBar = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                    bottomToolStrip.setPadding(bottomToolStrip.getPaddingLeft(), bottomToolStrip.getPaddingTop(),
                            bottomToolStrip.getPaddingRight(), dp(6) + navBar.bottom);
                }
                return insets;
            }
        });

        // Every background PDFBox/PDFium task runs on this one thread. Giving
        // that thread its own uncaught-exception handler keeps a failure there
        // (an OutOfMemoryError on a huge document, a malformed-PDF error) from
        // taking the whole process down and bouncing the user back to the
        // launcher: the task is abandoned, the viewer stays open, and the
        // reason is logged.
        java.util.concurrent.ThreadFactory workerFactory = new java.util.concurrent.ThreadFactory() {
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "docman-pdf-worker");
                t.setUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
                    @Override
                    public void uncaughtException(Thread thread, final Throwable e) {
                        // Heap is typically EXHAUSTED here (that is what killed
                        // the task), so this path allocates nothing: the
                        // reporter below is built once, up front. Allocating
                        // here threw a second OutOfMemoryError, which went to
                        // the system handler and killed the app anyway.
                        lastWorkerFailureWasOom = e instanceof OutOfMemoryError;
                        mainHandler.post(workerFailureReporter);
                    }
                });
                return t;
            }
        };
        // Search runs its own PDFBox fallback, so it gets the same handler.
        searchExecutor = Executors.newSingleThreadExecutor(workerFactory);
        thumbnailExecutor = Executors.newSingleThreadExecutor(workerFactory);

        SharedPreferences viewerPrefs = getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE);
        nightModeEnabled = viewerPrefs.getBoolean("nightMode", false);
        horizontalScrollEnabled = viewerPrefs.getBoolean("horizontalScroll", false);
        twoPageViewEnabled = viewerPrefs.getBoolean("twoPageView", false);

        // Whether the PDF EDITING tools are unlocked. Viewing, searching,
        // bookmarks, night mode, thumbnails, export and print are never gated
        // -- only the tools that change the document. Defaults to true so an
        // older JS bundle that does not send the flag never locks anyone out.
        isPro = getIntent().getBooleanExtra("pro", true);
        String[] triesExtra = getIntent().getStringArrayExtra("freeTries");
        if (triesExtra != null) java.util.Collections.addAll(freeTries, triesExtra);
        mainHandler.post(new Runnable() { @Override public void run() { installToolTryBadges(); } });
        pdfPath = getIntent().getStringExtra("path");
        pdfTitle = getIntent().getStringExtra("title");
        docId = getIntent().getStringExtra("docId");
        if (docId == null) docId = "";
        int initialPage = getIntent().getIntExtra("initialPage", -1);
        if (pdfTitle != null && !pdfTitle.isEmpty()) {
            titleText.setText(pdfTitle);
        }

        if (pdfPath == null || pdfPath.isEmpty()) {
            Toast.makeText(this, "No PDF to open", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // Starts PDFBox's one-time document parse (see warmTextLayoutDocument's
        // own comment for why this is worth doing this early) right away,
        // in parallel with PDFView/pdfium's own async load below -- rather
        // than only starting once pdfium finishes AND the person tries to
        // select something, so the ~10s(!) first-time cost on a large, dense
        // document has a head start instead of only beginning after the
        // document is already visible.
        warmTextLayoutDocument();

        loadUserBookmarks();

        // Remember Zoom Level — read once here (before first load) so
        // loadPdf() can restore it after the initial render. -1 means "no
        // saved zoom yet", in which case the library's own default applies.
        float initialZoom = -1f;
        if (!docId.isEmpty()) {
            SharedPreferences progressPrefs = getSharedPreferences(PROGRESS_PREFS, MODE_PRIVATE);
            initialZoom = progressPrefs.getFloat(docId + "_zoom", -1f);
        }

        backBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (searchTicking) { cancelRunningSearch(); return; }
                confirmExitAndFinish();
            }
        });
        // Catches the system back gesture/button too, not just this Activity's
        // own back button -- both need to offer saving pending highlights.
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (eraseModeActive) { cancelEraseMode(); return; }
                // A long search is work in progress: stop that first rather
                // than dropping the reader out of the document.
                if (searchTicking) { cancelRunningSearch(); return; }
                confirmExitAndFinish();
            }
        });

        rotateBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rotateView();
            }
        });

        bookmarkBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showBookmarksDialog();
            }
        });

        starRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleCurrentPageBookmark();
            }
        });

        // Tap toggles mark mode on/off (icon turns red while active).
        // Long-press clears any marks already drawn.
        markRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleMarkMode();
            }
        });
        markRow.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                markOverlay.clearMarks();
                pdfView.setSwipeEnabled(true);
                showNotice(NOTICE_OK, "Marks cleared", null);
                return true;
            }
        });

        // Adobe-like deep zoom range (default max is only 3x).
        // maxZoom kept at 10x rather than higher -- past this the render
        // engine's background tile thread starts falling behind on page
        // changes, causing a persistent blur after scrolling while zoomed in.
        pdfView.setMinZoom(1.0f);
        pdfView.setMidZoom(3.0f);
        pdfView.setMaxZoom(10.0f);

        watchChromeForInsets();
        loadPdf(initialPage, initialZoom);
        startZoomScrollIdlePoller();
    }

    // Centralizes (re)loading the document so night-mode / scroll-direction
    // toggles — both Configurator-time-only settings in this library, no
    // runtime setter exists for either — can reload without duplicating the
    // fromUri/fromFile branch. startPage/startZoom let a reload land back
    // where the person was instead of snapping to page 1.
    private void loadPdf(int startPage, float startZoom) {
        if (startPage < 0) startPage = lastKnownPage;
        final float restoreZoom = startZoom;

        // Built-in draggable scroll handle: sits hidden on the right edge,
        // fades in with the current page number while you drag it (or while
        // scrolling), and fades back out when idle -- no custom UI needed.
        DefaultScrollHandle scrollHandle = new DefaultScrollHandle(this);

        // Nudges a redraw of the new page after a page change while zoomed
        // in, to work around the render engine occasionally getting stuck on
        // the low-res placeholder after a fast scroll at high zoom. Uses
        // setPositionOffset(getPositionOffset(), false) rather than jumpTo()
        // for the same reason as the idle-poller nudge above: jumpTo(page,
        // false) snaps to that page's top edge regardless of where the
        // scroll/zoom actually is, which would yank the view away from
        // wherever the person is reading if they cross a page boundary
        // while zoomed in and panned off-center. isHandlingPageChange still
        // guards against any re-entrant call.
        OnPageChangeListener blurFixOnPageChange = new OnPageChangeListener() {
            @Override
            public void onPageChanged(int page, int pageCount) {
                lastKnownPage = page;
                lastKnownPageCount = pageCount;
                savePageProgress();
                updatePageIndicator();
                updateBookmarkPageIcon();

                // Warms the text-selection cache for the page someone just
                // landed on (plus a neighbour either side, cheap insurance
                // for a quick swipe) *before* they've tried to select
                // anything -- by the time a long-press's ~500ms hold timer
                // actually fires, extraction for that page has usually
                // already finished in the background, so it feels instant
                // instead of visibly waiting after every page turn.
                prefetchPageTextLayout(page);
                prefetchPageTextLayout(page - 1);
                prefetchPageTextLayout(page + 1);

                if (isHandlingPageChange) return;
                isHandlingPageChange = true;
                pdfView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        // Leaving the viewer (back) recycles the document while
                        // this 200ms nudge is still queued, and the library then
                        // NPEs inside getPositionOffset() -- crashing the app on
                        // the way out. Nothing to redraw in that case.
                        try {
                            // loadPages() re-renders what is on screen WITHOUT touching the scroll
                        // position. Re-applying a position offset (as this used to) nudged
                        // the view a little each time, which after a pinch-zoom looked like
                        // the area you had just zoomed into jumping upwards.
                        pdfView.loadPages();
                        } catch (Exception ignored) {
                        } finally {
                            isHandlingPageChange = false;
                        }
                    }
                }, 200);
            }
        };

        // Populates the bookmarks button once the document (and its table of
        // contents, if any) has finished loading. getTableOfContents() is
        // empty until this fires -- calling it any earlier always returns
        // an empty list. Button stays hidden for PDFs with no bookmarks
        // (most scanned/CAD-exported drawings won't have any).
        OnLoadCompleteListener bookmarksLoader = new OnLoadCompleteListener() {
            @Override
            public void loadComplete(int nbPages) {
                flatBookmarks.clear();
                flatBookmarkTitles.clear();
                flattenBookmarks(pdfView.getTableOfContents(), 0);
                bookmarkBtn.setVisibility(flatBookmarks.isEmpty() ? View.GONE : View.VISIBLE);

                lastKnownPageCount = nbPages;
                updatePageIndicator();
                updateBookmarkPageIcon();

                // Sizes pageTextLayoutCache to the page count with every slot
                // still null -- actual PDFBox extraction happens lazily, one
                // page at a time, in ensurePageTextLayoutForPage() the first
                // time a long-press lands on that page (see this class's
                // comment on that method for why: extracting all 400+ pages
                // of a large document up front before selection could work
                // AT ALL made long-press silently do nothing for a long time).
                // Only allocated once per document -- reruns on every reload
                // (rotate/night mode/scroll direction) would otherwise wipe
                // out pages already extracted this session for no reason,
                // since the underlying text never changes across those
                // reloads, only geometry does (which setTextLayouts() below
                // recomputes regardless via the overlay's own geometryReady
                // flag).
                if (pageTextLayoutCache == null) {
                    List<PageTextLayout> layouts = new ArrayList<>(nbPages);
                    for (int i = 0; i < nbPages; i++) layouts.add(null);
                    pageTextLayoutCache = layouts;
                }
                textSelectionOverlay.setTextLayouts(pageTextLayoutCache);
                // Warms the very first page too -- onPageChanged below only
                // fires on a page *change*, which wouldn't cover sitting on the
                // starting page without ever swiping. Delayed: on a big
                // document this opens the whole file in PDFBox, and doing that
                // while the viewer is still producing its first frame is what
                // left the page blank until the user touched the screen.
                mainHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() { prefetchPageTextLayout(pdfView.getCurrentPage()); }
                }, 900);

                // First-frame nudges. The idle poller only redraws after
                // something MOVED, so a document that is simply opened and left
                // alone never got one: the first page could stay blank until a
                // touch happened to invalidate the view.
                nudgeRedraw(80);
                nudgeRedraw(350);
                nudgeRedraw(1200);

                // Remember Zoom Level restore. Posted rather than called
                // inline so it runs after the library finishes its own
                // initial fit-to-width layout pass on this same frame.
                if (restoreZoom == TWO_PAGE_ZOOM_SENTINEL) {
                    pdfView.post(new Runnable() {
                        @Override
                        public void run() {
                            pdfView.zoomTo(TWO_PAGE_ZOOM);
                        }
                    });
                } else if (restoreZoom > 0f) {
                    pdfView.post(new Runnable() {
                        @Override
                        public void run() {
                            pdfView.zoomTo(restoreZoom);
                        }
                    });
                }
            }
        };

        // Password-protected PDFs -- see field comment on pendingPassword.
        // Applied via .password() below when set; showPasswordErrorHandler
        // detects a wrong/missing password and prompts instead of just
        // showing a generic "failed to open" error.
        com.github.barteksc.pdfviewer.listener.OnErrorListener passwordAwareErrorHandler =
                new com.github.barteksc.pdfviewer.listener.OnErrorListener() {
            @Override
            public void onError(Throwable t) {
                // Checked by class/message rather than a hard import --
                // the exact package for PdfPasswordException has moved
                // between AndroidPdfViewer/pdfium-android versions, and a
                // runtime check here is just as reliable without risking
                // a compile-time break if the dependency version differs.
                String className = t != null && t.getClass() != null ? t.getClass().getSimpleName() : "";
                String msg = t != null && t.getMessage() != null ? t.getMessage() : "";
                boolean isPasswordIssue = className.toLowerCase().contains("password")
                        || msg.toLowerCase().contains("password");
                if (isPasswordIssue) {
                    showPasswordDialog(pendingPassword != null);
                } else {
                    Toast.makeText(PdfViewerActivity.this, "Failed to open PDF: " + msg, Toast.LENGTH_LONG).show();
                    finish();
                }
            }
        };

        // Two-Page View needs a horizontal strip to lay pages side by side in,
        // regardless of the separate Scroll Direction preference -- that
        // preference is restored as-is once Two-Page View is turned back off.
        final boolean effectiveHorizontal = horizontalScrollEnabled || twoPageViewEnabled;

        try {
            // Capacitor Filesystem.getUri() returns a file:// URI -> fromUri handles it.
            // A plain absolute path also works via the File branch below.
            if (pdfPath.startsWith("file://") || pdfPath.startsWith("content://")) {
                PDFView.Configurator cfg = pdfView.fromUri(Uri.parse(pdfPath))
                        .enableSwipe(true)
                        .swipeHorizontal(effectiveHorizontal)
                        .enableDoubletap(true)       // double-tap to zoom
                        .enableAnnotationRendering(true)
                        .spacing(8)                  // gap between pages (dp)
                        .pageFitPolicy(FitPolicy.WIDTH)
                        // Vertical reading fits EVERY page to the screen width on
                        // its own. Without it the library scales all pages by the
                        // widest one, so in a manual with a big fold-out drawing
                        // the A4 pages open at a fraction of the screen and the
                        // 10x zoom cap is reached at ~2-3x of readable size.
                        // Horizontal/Two-Page keep the shared scale: there the
                        // library centres pages using a max height it never
                        // exposes, which the overlays' page maths couldn't mirror.
                        .fitEachPage(!effectiveHorizontal)
                        // Continuous scrolling: neither snapping nor single-
                        // page fling, so pages flow freely one into the next.
                        .pageSnap(false)
                        .pageFling(false)
                        .nightMode(nightModeEnabled)
                        .scrollHandle(scrollHandle)
                        .onPageChange(blurFixOnPageChange)
                        .onLoad(bookmarksLoader)
                        .onError(passwordAwareErrorHandler);
                if (startPage >= 0) cfg = cfg.defaultPage(startPage);
                if (pendingPassword != null) cfg = cfg.password(pendingPassword);
                cfg.load();
            } else {
                PDFView.Configurator cfg = pdfView.fromFile(new File(pdfPath))
                        .enableSwipe(true)
                        .swipeHorizontal(effectiveHorizontal)
                        .enableDoubletap(true)
                        .enableAnnotationRendering(true)
                        .spacing(8)
                        .pageFitPolicy(FitPolicy.WIDTH)
                        .fitEachPage(!effectiveHorizontal)
                        .pageSnap(false)
                        .pageFling(false)
                        .nightMode(nightModeEnabled)
                        .scrollHandle(scrollHandle)
                        .onPageChange(blurFixOnPageChange)
                        .onLoad(bookmarksLoader)
                        .onError(passwordAwareErrorHandler);
                if (startPage >= 0) cfg = cfg.defaultPage(startPage);
                if (pendingPassword != null) cfg = cfg.password(pendingPassword);
                cfg.load();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Failed to open PDF: " + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    // ============================================================
    // SECURITY -- password-protected PDFs
    // ============================================================
    // Set once the person successfully enters the right password, then
    // reapplied automatically on every reload this Activity instance does
    // (night mode toggle, scroll direction toggle, rotation) -- see
    // loadPdf()'s re-invocations elsewhere in this file. Cleared when the
    // Activity is destroyed, same as everything else here; never written
    // to disk.
    private String pendingPassword = null;

    // wrongAttempt distinguishes the FIRST prompt (no message shown yet,
    // in case the PDF isn't actually password-protected at all and this
    // is a real error) from a RETRY after a wrong password (shows "wrong
    // password, try again" so the person knows why they're seeing the
    // dialog a second time).
    private void showPasswordDialog(final boolean wrongAttempt) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setHint(wrongAttempt ? "Wrong password -- try again" : "Enter PDF password");
        input.setTextColor(COLOR_INACTIVE);
        input.setHintTextColor(wrongAttempt ? COLOR_ACTIVE : Color.parseColor("#94A3B8"));
        int pad = dp(20);
        input.setPadding(pad, dp(12), pad, dp(12));

        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Password Protected")
                .setView(input)
                .setCancelable(false)
                .setPositiveButton("Unlock", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        String pwd = input.getText().toString();
                        if (pwd.isEmpty()) {
                            showPasswordDialog(wrongAttempt);
                            return;
                        }
                        pendingPassword = pwd;
                        loadPdf(-1, -1f);
                    }
                })
                .setNegativeButton("Cancel", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        finish();
                    }
                })
                .show();
    }

    // Walks the (possibly nested) bookmark tree PDFium returns and flattens
    // it into flatBookmarks/flatBookmarkTitles, indenting child entries so
    // the hierarchy is still visible in a plain list.
    private void flattenBookmarks(List<PdfDocument.Bookmark> tree, int depth) {
        String indent = depth > 0 ? repeat("    ", depth) + "— " : "";
        for (PdfDocument.Bookmark b : tree) {
            flatBookmarks.add(b);
            flatBookmarkTitles.add(indent + b.getTitle());
            if (b.hasChildren()) {
                flattenBookmarks(b.getChildren(), depth + 1);
            }
        }
    }

    private static String repeat(String s, int times) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < times; i++) sb.append(s);
        return sb.toString();
    }

    private void showBookmarksDialog() {
        if (flatBookmarks.isEmpty()) return;
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Bookmarks")
                .setItems(flatBookmarkTitles.toArray(new String[0]), new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        pdfView.jumpTo((int) flatBookmarks.get(which).getPageIdx(), true);
                        dialog.dismiss();
                    }
                })
                .show();
    }

    private void toggleMarkMode() {
        boolean nowEnabled = !markOverlay.isMarkModeEnabled();
        markOverlay.setMarkModeEnabled(nowEnabled);
        markBtn.setColorFilter(nowEnabled ? COLOR_ACTIVE : COLOR_INACTIVE, PorterDuff.Mode.SRC_IN);
        // Mark mode and text selection both want first crack at touches --
        // let Mark win while it's active rather than have them fight over
        // the same drag gesture.
        textSelectionOverlay.setMarkModeActive(nowEnabled);
        if (nowEnabled) {
            textSelectionOverlay.clearSelection();
            showNotice(NOTICE_INFO, "Mark mode on", "Drag to circle one spot · long-press ◯ to clear");
        }
    }

    // Rotates the PDFView's container (and the mark overlay riding along
    // with it) 90 degrees clockwise each tap. AndroidPdfViewer has no
    // built-in page-rotation API, so this rotates the whole view visually
    // and swaps its width/height so it still fills the screen -- handy for
    // landscape-oriented industrial drawings.
    private void rotateView() {
        rotationDegrees = (rotationDegrees + 90) % 360;

        final View parent = (View) pdfContainer.getParent();
        final int parentWidth = parent.getWidth();
        final int parentHeight = parent.getHeight();

        ViewGroup.LayoutParams lp = pdfContainer.getLayoutParams();
        if (rotationDegrees == 90 || rotationDegrees == 270) {
            lp.width = parentHeight;
            lp.height = parentWidth;
        } else {
            lp.width = parentWidth;
            lp.height = parentHeight;
        }
        pdfContainer.setLayoutParams(lp);
        pdfContainer.setRotation(rotationDegrees);
    }

    // Hardware / gesture back closes the viewer instantly and returns to the WebView.
    // No slow WebView teardown -> the "back button slow" issue disappears.

    // Continue Reading — throttle-free write (SharedPreferences.apply() is
    // async and cheap) so the saved position is always at most one page
    // change stale, even if the process is killed outright afterward. Also
    // carries Remember Zoom Level: same record, one extra float.
    private void savePageProgress() {
        if (docId == null || docId.isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences(PROGRESS_PREFS, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit()
                .putInt(docId + "_page", lastKnownPage)
                .putInt(docId + "_total", lastKnownPageCount)
                .putLong(docId + "_time", System.currentTimeMillis());
        if (pdfView != null) {
            editor.putFloat(docId + "_zoom", pdfView.getZoom());
        }
        editor.apply();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // App Lock reached this viewer through a real background/foreground
        // cycle (see DocmanApplication/AppLockGate -- ProcessLifecycleOwner-
        // driven, so this deliberately does NOT fire for rotation or for
        // returning from a share sheet/print dialog/camera/file picker,
        // only for the app having actually left the foreground). Rather
        // than showing a native PIN/biometric prompt here (which would
        // duplicate the JS App Lock flow), just close this viewer -- control
        // returns to the WebView, which already re-shows its own tested
        // lock screen on the same backgrounding event, and the person can
        // reopen the PDF once unlocked there.
        if (AppLockGate.consumeNeedsReauth()) {
            finish();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Safety net: covers the case where the activity is backgrounded or
        // killed without a fresh onPageChanged firing after the last scroll.
        savePageProgress();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopSearchTicker();
        // Memory optimization — nothing else here holds native PDFium
        // resources directly (thumbnail rendering below always opens and
        // closes its own short-lived PdfiumCore document), but the
        // background executor itself must be shut down or its thread leaks
        // past the Activity's lifetime.
        if (thumbnailExecutor != null) thumbnailExecutor.shutdownNow();
        if (searchExecutor != null) searchExecutor.shutdownNow();
        cancelDeepSweep();
        if (sharedRecognizer != null) { try { sharedRecognizer.close(); } catch (Exception ignored) { } }
        closeRenderDocument();
        if (textLayoutDoc != null) { try { textLayoutDoc.close(); } catch (Exception ignored) { } }
        if (cachedContentCopyFile != null) { try { cachedContentCopyFile.delete(); } catch (Exception ignored) { } }
        zoomScrollIdlePollerStarted = false;
        // The idle poller and delayed redraws re-post themselves every 60 ms;
        // drop anything still queued so none of it runs against a PDFView
        // whose document is already being closed.
        mainHandler.removeCallbacksAndMessages(null);
    }

    // ============================================================
    // ZOOM / SCROLL IDLE REDRAW NUDGE
    // ============================================================
    // Same underlying render-engine quirk as blurFixOnPageChange above --
    // it can leave a low-res placeholder tile on screen -- but triggered by
    // pinch-zooming or panning WITHIN a page rather than crossing a page
    // boundary, so that listener alone doesn't catch it. Polls zoom + scroll
    // offsets on a timer; once two consecutive polls read the same values
    // (i.e. the gesture has stopped), it fires one non-animated jumpTo() to
    // force a fresh, full-resolution render of what's currently on screen.
    // Deliberately timer-based rather than a touch listener, since this
    // library's own DragPinchManager already owns the view's touch
    // handling -- attaching another touch listener here would fight it.
    private void startZoomScrollIdlePoller() {
        if (zoomScrollIdlePollerStarted) return;
        zoomScrollIdlePollerStarted = true;
        mainHandler.postDelayed(zoomScrollIdlePollTick, 60);
    }

    private final Runnable zoomScrollIdlePollTick = new Runnable() {
        @Override
        public void run() {
            if (!zoomScrollIdlePollerStarted || pdfView == null) return;
            try {
                float zoom = pdfView.getZoom();
                float xOff = pdfView.getCurrentXOffset();
                float yOff = pdfView.getCurrentYOffset();

                boolean unchangedSincePrevPoll = (zoom == lastPolledZoom
                        && xOff == lastPolledXOffset && yOff == lastPolledYOffset);

                if (unchangedSincePrevPoll) {
                    if (pendingIdleNudge && !isHandlingPageChange) {
                        isHandlingPageChange = true;
                        // loadPages() re-renders what is on screen WITHOUT touching the scroll
                        // position. Re-applying a position offset (as this used to) nudged
                        // the view a little each time, which after a pinch-zoom looked like
                        // the area you had just zoomed into jumping upwards.
                        pdfView.loadPages();
                        isHandlingPageChange = false;
                        pendingIdleNudge = false;
                    }
                } else {
                    // Still moving -- remember this reading and arm the nudge
                    // so it fires the *next* time two polls agree.
                    pendingIdleNudge = true;
                }
                lastPolledZoom = zoom;
                lastPolledXOffset = xOff;
                lastPolledYOffset = yOff;
            } catch (Exception ignored) {
                // Don't let a transient read failure kill the poll loop.
            }
            mainHandler.postDelayed(this, 60);
        }
    };


    // ============================================================
    // PAGE INDICATOR
    // ============================================================

    private void updatePageIndicator() {
        if (pageIndicator == null) return;
        if (lastKnownPageCount <= 0) { pageIndicator.setVisibility(View.GONE); return; }
        pageIndicator.setVisibility(View.VISIBLE);
        pageIndicator.setText((lastKnownPage + 1) + " / " + lastKnownPageCount);
    }

    // ============================================================
    // JUMP TO PAGE
    // ============================================================

    private void showJumpToPageDialog() {
        if (lastKnownPageCount <= 0) return;
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setHint("Page 1 – " + lastKnownPageCount);
        input.setTextColor(COLOR_INACTIVE);
        input.setHintTextColor(Color.parseColor("#94A3B8"));
        int pad = dp(20);
        input.setPadding(pad, dp(12), pad, dp(12));

        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Jump to Page")
                .setView(input)
                .setPositiveButton("Go", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        String raw = input.getText().toString().trim();
                        if (raw.isEmpty()) return;
                        try {
                            int page = Integer.parseInt(raw);
                            if (page < 1) page = 1;
                            if (page > lastKnownPageCount) page = lastKnownPageCount;
                            pdfView.jumpTo(page - 1, true);
                        } catch (NumberFormatException e) {
                            showNotice(NOTICE_ERROR, "Enter a valid page number", null);
                        }
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    // ============================================================
    // BOOKMARK PAGES (user-created, separate from the PDF's own TOC)
    // ============================================================

    private void loadUserBookmarks() {
        bookmarkedPages.clear();
        if (docId == null || docId.isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences(USER_BOOKMARKS_PREFS, MODE_PRIVATE);
        String raw = prefs.getString(docId, "");
        if (raw == null || raw.isEmpty()) return;
        for (String part : raw.split(",")) {
            try { bookmarkedPages.add(Integer.parseInt(part.trim())); } catch (NumberFormatException ignored) { }
        }
    }

    private void saveUserBookmarks() {
        if (docId == null || docId.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (Integer p : bookmarkedPages) {
            if (sb.length() > 0) sb.append(',');
            sb.append(p);
        }
        getSharedPreferences(USER_BOOKMARKS_PREFS, MODE_PRIVATE)
                .edit()
                .putString(docId, sb.toString())
                .apply();
    }

    private void toggleCurrentPageBookmark() {
        int page = pdfView.getCurrentPage();
        if (bookmarkedPages.contains(page)) {
            bookmarkedPages.remove(page);
            showNotice(NOTICE_OK, "Bookmark removed", "Page " + (page + 1));
        } else {
            bookmarkedPages.add(page);
            showNotice(NOTICE_OK, "Page " + (page + 1) + " bookmarked", "Find it in More → My bookmarks");
        }
        saveUserBookmarks();
        updateBookmarkPageIcon();
    }

    private void updateBookmarkPageIcon() {
        if (bookmarkPageBtn == null) return;
        boolean marked = bookmarkedPages.contains(lastKnownPage);
        bookmarkPageBtn.setColorFilter(marked ? COLOR_BOOKMARKED : COLOR_INACTIVE, PorterDuff.Mode.SRC_IN);
    }

    private void showMyBookmarksDialog() {
        if (bookmarkedPages.isEmpty()) {
            showNotice(NOTICE_INFO, "No bookmarked pages yet", "Tap the star to bookmark a page");
            return;
        }
        List<Integer> pages = new ArrayList<>(bookmarkedPages);
        java.util.Collections.sort(pages);
        String[] labels = new String[pages.size()];
        for (int i = 0; i < pages.size(); i++) labels[i] = "Page " + (pages.get(i) + 1);

        final List<Integer> pagesFinal = pages;
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("My Bookmarks")
                .setItems(labels, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        pdfView.jumpTo(pagesFinal.get(which), true);
                        dialog.dismiss();
                    }
                })
                .show();
    }

    // ============================================================
    // MORE MENU — the less-frequently-used tools; the 5 most-used ones
    // (Search, Pages, Sign, Fill Form, Redact) live in the persistent
    // bottom tool strip instead (see pdfBottomToolStrip wiring in
    // onCreate) so they're one tap instead of two.
    // ============================================================

    // ============================================================
    // FREE TRIES -- every Pro tool can be used once for free.
    // ------------------------------------------------------------
    // A try is spent only when the tool's result is SAVED
    // (spendFreeTryIfSaved), so opening a tool and cancelling costs
    // nothing. The record is shared with the web layer through FreeTries,
    // and the DOCMAN Pro screen lives there too. Viewing a document is
    // never blocked.
    // ============================================================
    private static String toolLabel(String key) {
        switch (key) {
            case "sign": return "Signing";
            case "highlight": return "Highlighting";
            case "fillform": return "Filling forms";
            case "redact": return "Erasing";
            case "crop": return "Cropping pages";
            case "ocr": return "Reading scanned pages";
            default: return "This tool";
        }
    }

    // True when the tool may be used now: Pro is bought, or its free try is
    // still unused. Otherwise explains why and offers the Pro screen.
    private boolean requireTool(final String key) {
        // Every editing tool saves through PDFBox, which is refused for very
        // large files. Say so before the user marks up a page, not after.
        if (isTooLargeForPdfBox()) {
            if (!isFinishing()) {
                new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                        .setTitle("File too large to edit")
                        .setMessage(PDF_TOO_LARGE_MESSAGE)
                        .setPositiveButton("OK", null)
                        .show();
            }
            return false;
        }
        if (isPro) return true;
        if (freeTries.contains(key)) {
            if (freeTryNoticeShown.add(key)) {
                showNotice(NOTICE_FREE, "Free try of " + toolLabel(key), "Used only when you save a copy");
            }
            return true;
        }
        showToolLockedDialog(key);
        return false;
    }

    // The Pro screen lives in the web layer, so choosing it closes this
    // viewer and asks PdfNativePlugin to open it.
    private void showToolLockedDialog(final String key) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("DOCMAN Pro")
                .setMessage("You’ve used your free try of " + toolLabel(key)
                        + ". Your documents stay open and readable either way.")
                .setNegativeButton("Not now", null)
                .setPositiveButton("See DOCMAN Pro", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        PdfNativePlugin.requestProScreen(key);
                        finish();
                    }
                })
                .show();
    }

    // Called from a background save thread with that save's result message.
    // Only a real save ("Saved in this folder" / "Saved to Downloads") spends
    // the try -- a failed save leaves it for next time.
    private void spendFreeTryIfSaved(final String key, String resultMessage) {
        if (isPro || resultMessage == null || !resultMessage.startsWith("Saved")) return;
        final android.content.Context app = getApplicationContext();
        mainHandler.post(new Runnable() {
            @Override
            public void run() { spendFreeTry(app, key); }
        });
    }

    // Main thread only.
    private void spendFreeTry(android.content.Context app, String key) {
        if (isPro || !freeTries.remove(key)) return;
        FreeTries.consume(app, key);
        PdfNativePlugin.notifyFreeTryUsed(key);
        updateToolTryBadges();
    }

    // FREE / PRO labels on the bottom toolbar. None at all for Pro users.
    private void installToolTryBadges() {
        if (isPro) return;
        addToolTryBadge(R.id.pdfToolSign, "sign");
        addToolTryBadge(R.id.pdfToolFillForm, "fillform");
        addToolTryBadge(R.id.pdfToolRedact, "redact");
        updateToolTryBadges();
    }

    private void addToolTryBadge(int itemId, String key) {
        View v = findViewById(itemId);
        if (!(v instanceof LinearLayout) || toolTryBadges.containsKey(key)) return;
        LinearLayout item = (LinearLayout) v;
        if (item.getChildCount() == 0) return;

        // The icon moves into a frame so the label can float just above it,
        // inside the toolbar's top padding, without making the toolbar taller.
        View icon = item.getChildAt(0);
        ViewGroup.LayoutParams iconLp = icon.getLayoutParams();
        item.removeViewAt(0);

        FrameLayout frame = new FrameLayout(this);
        frame.setClipChildren(false);
        frame.setClipToPadding(false);
        frame.addView(icon, new FrameLayout.LayoutParams(
                iconLp != null ? iconLp.width : dp(21),
                iconLp != null ? iconLp.height : dp(21),
                Gravity.CENTER));

        TextView badge = makeTryBadge(false);
        frame.addView(badge, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.CENTER_HORIZONTAL));
        badge.setTranslationY(-dp(12));

        LinearLayout.LayoutParams frameLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        frameLp.gravity = Gravity.CENTER_HORIZONTAL;
        if (iconLp instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) iconLp;
            frameLp.setMargins(m.leftMargin, m.topMargin, m.rightMargin, m.bottomMargin);
        }
        item.addView(frame, 0, frameLp);

        item.setClipChildren(false);
        item.setClipToPadding(false);
        if (item.getParent() instanceof ViewGroup) {
            ViewGroup strip = (ViewGroup) item.getParent();
            strip.setClipChildren(false);
            strip.setClipToPadding(false);
        }
        toolTryBadges.put(key, badge);
    }

    // ============================================================
    // NOTICE CARD -- replaces Android's grey Toast for the messages that
    // matter in the viewer: a tool's free try, "saving...", where an edited
    // copy went, and save failures. A DOCMAN-styled card just above the
    // bottom toolbar; slides up, auto-hides (the thin line shows the time
    // left), tap to close. A new notice replaces the current one. Approved
    // from a PNG preview on 2026-09-14.
    // ============================================================
    private static final int NOTICE_FREE = 0;
    private static final int NOTICE_OK = 1;
    private static final int NOTICE_ERROR = 2;
    private static final int NOTICE_BUSY = 3;
    private static final int NOTICE_INFO = 4; // modes, tips, "nothing to..." (2026-09-16)
    private View noticeView;
    private final Runnable hideNoticeRunnable = new Runnable() {
        @Override
        public void run() { hideNotice(); }
    };

    private void showNotice(final int kind, final String title, final String detail) {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() { showNotice(kind, title, detail); }
            });
            return;
        }
        if (isFinishing()) return;
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;
        mainHandler.removeCallbacks(hideNoticeRunnable);
        if (noticeView != null) {
            noticeView.animate().cancel();
            content.removeView(noticeView);
            noticeView = null;
        }

        int accent = kind == NOTICE_OK ? Color.parseColor("#4ADE80")
                : kind == NOTICE_ERROR ? Color.parseColor("#F87171")
                : kind == NOTICE_INFO ? Color.parseColor("#C4B5FD")
                : Color.parseColor("#FF8A3D");

        FrameLayout card = new FrameLayout(this);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#3A1F5E"), Color.parseColor("#221035")});
        bg.setCornerRadius(dp(16));
        // A strong accent outline: the card has to stand out on dark pages
        // (screenshots, night mode) as well as on white ones.
        bg.setStroke(Math.round(1.5f * getResources().getDisplayMetrics().density),
                (accent & 0x00FFFFFF) | 0xCC000000);
        card.setBackground(bg);
        card.setElevation(dp(12));
        card.setClipToOutline(true);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(14), dp(13));

        View lead;
        int leadW, leadH;
        if (kind == NOTICE_FREE) {
            TextView badge = makeTryBadge(true);
            styleTryBadge(badge, true, true);
            lead = badge;
            leadW = ViewGroup.LayoutParams.WRAP_CONTENT;
            leadH = ViewGroup.LayoutParams.WRAP_CONTENT;
        } else if (kind == NOTICE_BUSY) {
            android.widget.ProgressBar spinner = new android.widget.ProgressBar(this);
            spinner.setIndeterminate(true);
            spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(accent));
            lead = spinner;
            leadW = dp(26);
            leadH = dp(26);
        } else {
            TextView icon = new TextView(this);
            icon.setText(kind == NOTICE_OK ? "✓" : kind == NOTICE_INFO ? "i" : "!");
            icon.setTextColor(accent);
            icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            icon.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            icon.setGravity(Gravity.CENTER);
            android.graphics.drawable.GradientDrawable circle = new android.graphics.drawable.GradientDrawable();
            circle.setShape(android.graphics.drawable.GradientDrawable.OVAL);
            circle.setColor((accent & 0x00FFFFFF) | 0x26000000);
            icon.setBackground(circle);
            lead = icon;
            leadW = dp(34);
            leadH = dp(34);
        }
        LinearLayout.LayoutParams leadLp = new LinearLayout.LayoutParams(leadW, leadH);
        leadLp.setMarginEnd(dp(12));
        row.addView(lead, leadLp);

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f);
        titleView.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        texts.addView(titleView);
        if (detail != null && !detail.isEmpty()) {
            TextView detailView = new TextView(this);
            detailView.setText(detail);
            detailView.setTextColor(Color.parseColor("#CBBFE0"));
            detailView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
            detailView.setMaxLines(kind == NOTICE_ERROR || kind == NOTICE_INFO ? 2 : 1);
            detailView.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams dLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            dLp.topMargin = dp(2);
            texts.addView(detailView, dLp);
        }
        row.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(row, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final long duration = kind == NOTICE_ERROR ? 6000 : 4000;
        if (kind != NOTICE_BUSY) {
            View timer = new View(this);
            if (kind == NOTICE_FREE) {
                timer.setBackground(new android.graphics.drawable.GradientDrawable(
                        android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
                        new int[]{Color.parseColor("#FFC27A"), Color.parseColor("#F26B14")}));
            } else {
                timer.setBackgroundColor(accent);
            }
            card.addView(timer, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(2), Gravity.BOTTOM));
            timer.setPivotX(0f);
            timer.animate().scaleX(0f).setDuration(duration)
                    .setInterpolator(new android.view.animation.LinearInterpolator()).start();
        }

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        lp.leftMargin = dp(12);
        lp.rightMargin = dp(12);
        lp.bottomMargin = noticeBottomOffset();
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { hideNotice(); }
        });
        content.addView(card, lp);
        noticeView = card;

        card.setAlpha(0f);
        card.setTranslationY(dp(24));
        card.animate().alpha(1f).translationY(0f).setDuration(220)
                .setInterpolator(new android.view.animation.DecelerateInterpolator()).start();
        if (kind != NOTICE_BUSY) mainHandler.postDelayed(hideNoticeRunnable, duration);
    }

    private void hideNotice() {
        final View v = noticeView;
        if (v == null) return;
        noticeView = null;
        mainHandler.removeCallbacks(hideNoticeRunnable);
        v.animate().alpha(0f).translationY(dp(12)).setDuration(180).withEndAction(new Runnable() {
            @Override
            public void run() {
                if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
            }
        }).start();
    }

    // Just above the bottom toolbar while it is on screen; above the
    // navigation bar otherwise (full screen, toolbar hidden).
    private int noticeBottomOffset() {
        View content = findViewById(android.R.id.content);
        View strip = findViewById(R.id.pdfBottomToolStrip);
        if (content != null && strip != null && strip.isShown() && strip.getHeight() > 0) {
            int[] c = new int[2];
            int[] s = new int[2];
            content.getLocationInWindow(c);
            strip.getLocationInWindow(s);
            int fromBottom = (c[1] + content.getHeight()) - s[1];
            if (fromBottom > 0 && fromBottom < content.getHeight()) return fromBottom + dp(14);
        }
        int nav = 0;
        if (content != null && content.getRootWindowInsets() != null) {
            nav = content.getRootWindowInsets().getSystemWindowInsetBottom();
        }
        return nav + dp(16);
    }

    // Turns a save's result message into the matching card.
    private void showSaveResult(String msg) {
        if (msg == null) return;
        final String inFolder = "Saved in this folder as ";
        final String inDownloads = "Saved to Downloads: ";
        if (msg.startsWith(inFolder)) {
            showNotice(NOTICE_OK, "Saved in this folder", msg.substring(inFolder.length()));
        } else if (msg.startsWith(inDownloads)) {
            showNotice(NOTICE_OK, "Saved to Downloads", msg.substring(inDownloads.length()));
        } else {
            String detail = msg;
            int colon = msg.indexOf(": ");
            if (msg.startsWith("Save failed") && colon > 0) detail = msg.substring(colon + 2);
            showNotice(NOTICE_ERROR, "Could not save the copy", detail);
        }
    }

    private TextView makeTryBadge(boolean large) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, large ? 10f : 8.5f);
        t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        t.setLetterSpacing(0.08f);
        t.setIncludeFontPadding(false);
        t.setGravity(Gravity.CENTER);
        int padH = dp(large ? 7 : 5), padV = dp(large ? 4 : 2);
        t.setPadding(padH, padV, padH, padV);
        return t;
    }

    // Same colours as the web layer's .try-badge in style.css.
    private void styleTryBadge(TextView t, boolean free, boolean large) {
        android.graphics.drawable.GradientDrawable bg;
        if (free) {
            bg = new android.graphics.drawable.GradientDrawable(
                    android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
                    new int[]{Color.parseColor("#FFC27A"), Color.parseColor("#FF9442"), Color.parseColor("#F26B14")});
            t.setTextColor(Color.parseColor("#241000"));
            t.setText("FREE");
        } else {
            bg = new android.graphics.drawable.GradientDrawable();
            bg.setColor(Color.parseColor("#D9281408"));
            bg.setStroke(dp(1), Color.parseColor("#8CFF8A3D"));
            t.setTextColor(Color.parseColor("#FFB27D"));
            t.setText("PRO");
        }
        bg.setCornerRadius(dp(large ? 7 : 6));
        t.setBackground(bg);
    }

    private void updateToolTryBadges() {
        for (Map.Entry<String, TextView> e : toolTryBadges.entrySet()) {
            styleTryBadge(e.getValue(), freeTries.contains(e.getKey()), false);
        }
    }

    private void showMoreMenu() {
        // A grid of icon tiles rather than a long list: every tool is visible
        // at once, in about a third of the height.
        android.widget.GridLayout rows = new android.widget.GridLayout(this);
        rows.setColumnCount(4);
        int pad = dp(10);
        rows.setPadding(pad, dp(8), pad, dp(10));

        final AlertDialog dialog = new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("More")
                .setView(rows)
                .create();

        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_jump, "Jump to page", null, new Runnable() {
            @Override public void run() { showJumpToPageDialog(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_bookmark, "My bookmarks", null, new Runnable() {
            @Override public void run() { showMyBookmarksDialog(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_night, "Night mode", nightModeEnabled ? "On" : "Off", new Runnable() {
            @Override public void run() { toggleNightMode(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_scroll, "Scroll direction", horizontalScrollEnabled ? "Horizontal" : "Vertical", new Runnable() {
            @Override public void run() { toggleScrollDirection(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_twopage, "Two-page view", twoPageViewEnabled ? "On" : "Off", new Runnable() {
            @Override public void run() { toggleTwoPageView(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_fullscreen, isFullScreen ? "Exit full screen" : "Full screen", null, new Runnable() {
            @Override public void run() { toggleFullScreen(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_copy, "Copy page text", null, new Runnable() {
            @Override public void run() { copyCurrentPageText(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_attach, "Attachments", null, new Runnable() {
            @Override public void run() { showAttachmentsDialog(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_crop, "Crop page", null, new Runnable() {
            @Override public void run() { if (!requireTool("crop")) return; enterCropMode(); }
        });
        if (!isPro && rows.getChildAt(rows.getChildCount() - 1) instanceof LinearLayout) {
            TextView cropBadge = makeTryBadge(true);
            styleTryBadge(cropBadge, freeTries.contains("crop"), true);
            ((LinearLayout) rows.getChildAt(rows.getChildCount() - 1)).addView(cropBadge);
        }
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_print, "Print", null, new Runnable() {
            @Override public void run() { printCurrentDocument(); }
        });
        addMoreMenuRow(rows, dialog, R.drawable.ic_pdf_export, "Export", null, new Runnable() {
            @Override public void run() { exportToDownloads(); }
        });

        dialog.show();
    }

    // One icon + label (+ optional current-state text on the right) row for
    // showMoreMenu() above -- pulled into a helper since all 10 rows share
    // the same structure and only the icon/label/state/action differ.
    // One tile in the More grid: icon above its name, with the current setting
    // ("On", "Horizontal") underneath where a tool has one.
    private void addMoreMenuRow(android.widget.GridLayout container, final AlertDialog dialog, int iconRes,
            String label, String stateText, final Runnable action) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_HORIZONTAL);
        tile.setClickable(true);
        tile.setFocusable(true);
        TypedValue outValue = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, outValue, true);
        tile.setBackgroundResource(outValue.resourceId);
        tile.setPadding(dp(4), dp(12), dp(4), dp(10));

        android.widget.GridLayout.LayoutParams lp = new android.widget.GridLayout.LayoutParams();
        lp.width = 0;
        lp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
        lp.columnSpec = android.widget.GridLayout.spec(android.widget.GridLayout.UNDEFINED, 1f);
        tile.setLayoutParams(lp);

        ImageView icon = new ImageView(this);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(26), dp(26));
        icon.setLayoutParams(iconParams);
        icon.setImageResource(iconRes);
        icon.setColorFilter(COLOR_INACTIVE, PorterDuff.Mode.SRC_IN);
        tile.addView(icon);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(COLOR_INACTIVE);
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        labelView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        labelParams.topMargin = dp(6);
        labelView.setLayoutParams(labelParams);
        tile.addView(labelView);

        if (stateText != null) {
            TextView stateView = new TextView(this);
            stateView.setText(stateText);
            stateView.setTextColor(Color.parseColor("#8A8FB0"));
            stateView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f);
            stateView.setGravity(Gravity.CENTER);
            tile.addView(stateView);
        }

        tile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                action.run();
            }
        });

        container.addView(tile);
    }

    // ============================================================
    // EXPORT -- saves a copy of the currently-open PDF to the device's
    // public Downloads folder via MediaStore (scoped-storage compliant,
    // no storage permission needed on Android 10+). Distinct from Share:
    // this puts a durable copy on the device itself rather than handing
    // it to another app.
    // ============================================================
    private void exportToDownloads() {
        if (pdfPath == null || pdfPath.isEmpty()) {
            showNotice(NOTICE_INFO, "Nothing to export", null);
            return;
        }
        final String exportName = (pdfTitle != null && !pdfTitle.isEmpty())
                ? (pdfTitle.toLowerCase().endsWith(".pdf") ? pdfTitle : pdfTitle + ".pdf")
                : "document.pdf";

        java.io.InputStream in = null;
        try {
            if (pdfPath.startsWith("content://")) {
                in = getContentResolver().openInputStream(Uri.parse(pdfPath));
            } else if (pdfPath.startsWith("file://")) {
                in = new java.io.FileInputStream(new File(Uri.parse(pdfPath).getPath()));
            } else {
                in = new java.io.FileInputStream(new File(pdfPath));
            }
            if (in == null) {
                showNotice(NOTICE_ERROR, "Could not read this document", null);
                return;
            }

            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, exportName);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

            Uri dest = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) {
                showNotice(NOTICE_ERROR, "Could not save to Downloads", "The file could not be created");
                return;
            }

            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) {
                showNotice(NOTICE_ERROR, "Could not save to Downloads", "Writing the file failed");
                return;
            }
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
            out.flush();
            out.close();

            showNotice(NOTICE_OK, "Saved to Downloads", exportName);
        } catch (Exception e) {
            showNotice(NOTICE_ERROR, "Export failed", e.getMessage());
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
        }
    }

    // ============================================================
    // COPY PAGE TEXT -- reuses the same pageTextsCache/ensurePageTextsExtracted
    // built for Search Text, so the first use on a document pays the
    // extraction cost once and later copies are instant.
    // ============================================================
    private void copyCurrentPageText() {
        if (lastKnownPageCount <= 0) return;
        final int page = pdfView.getCurrentPage();
        ensurePageTextsExtracted(new Runnable() {
            @Override
            public void run() {
                if (pageTextsCache == null || page < 0 || page >= pageTextsCache.size()) {
                    showNotice(NOTICE_ERROR, "Could not read this page's text", null);
                    return;
                }
                String text = pageTextsCache.get(page);
                if (text == null || text.trim().isEmpty()) {
                    showNotice(NOTICE_INFO, "No text on this page", null);
                    return;
                }
                android.content.ClipboardManager clipboard =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                android.content.ClipData clip = android.content.ClipData.newPlainText("Page " + (page + 1) + " text", text);
                clipboard.setPrimaryClip(clip);
                showNotice(NOTICE_OK, "Page " + (page + 1) + " text copied", "Ready to paste anywhere");
            }
        });
    }

    // ============================================================
    // SEARCH TEXT (page-level: jumps to the matching page, no on-page
    // highlight box -- see pageTextsCache comment above for why)
    // ============================================================

    // Opens the inline bar and puts the cursor in it, rather than a dialog
    // that takes the query and then throws it away -- keeping the text on
    // screen is what lets someone see what they searched and correct a typo
    // without starting over.
    private void showSearchDialog() {
        if (lastKnownPageCount <= 0) return;
        stopSearchTicker();
        searchBar.setVisibility(View.VISIBLE);
        searchLabel.setText("");
        setSearchStepEnabled(false);
        searchInput.setText("");
        searchInput.requestFocus();
        android.view.inputmethod.InputMethodManager imm =
                (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(searchInput, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
    }

    private void hideSearchKeyboard() {
        android.view.inputmethod.InputMethodManager imm =
                (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null && searchInput != null) {
            imm.hideSoftInputFromWindow(searchInput.getWindowToken(), 0);
        }
    }

    private void setSearchStepEnabled(boolean on) {
        searchPrevBtn.setEnabled(on);
        searchNextBtn.setEnabled(on);
        searchPrevBtn.setAlpha(on ? 1f : 0.35f);
        searchNextBtn.setAlpha(on ? 1f : 0.35f);
    }

    // Opens its own short-lived PDDocument purely for text extraction --
    // completely separate from pdfView's own pdfium document, same
    // never-hold-two-full-documents-longer-than-needed principle as
    // renderSinglePageThumbnail below.
    // PDDocument.load(InputStream) forces PDFBox to buffer the ENTIRE stream
    // itself before it can do the random-access parsing a PDF's xref table
    // needs (real PDFs put that table at the END of the file), so for a
    // content:// source, copy it into the app's cache dir ONCE (a plain
    // sequential byte copy) and load from THAT file on every subsequent
    // open instead of re-reading through the ContentResolver each time.
    // Cleaned up in onDestroy(). NOTE: on-device timing showed this is NOT
    // the dominant cost for a large, dense document -- PDDocument.load()
    // itself (PDFBox's own structural parse) can still take several seconds
    // regardless of source; see warmTextLayoutDocument()'s comment.
    private File cachedContentCopyFile = null;

    private File resolveLocalFileForExtraction() throws Exception {
        if (pdfPath.startsWith("file://")) {
            return new File(Uri.parse(pdfPath).getPath());
        } else if (!pdfPath.startsWith("content://")) {
            return new File(pdfPath);
        }
        if (cachedContentCopyFile != null && cachedContentCopyFile.exists()) {
            return cachedContentCopyFile;
        }
        File out = File.createTempFile("pdf_extract_", ".pdf", getCacheDir());
        java.io.InputStream in = getContentResolver().openInputStream(Uri.parse(pdfPath));
        java.io.OutputStream os = new java.io.FileOutputStream(out);
        try {
            byte[] buf = new byte[64 * 1024];
            int len;
            while ((len = in.read(buf)) > 0) {
                os.write(buf, 0, len);
            }
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
            try { os.close(); } catch (Exception ignored) { }
        }
        cachedContentCopyFile = out;
        return out;
    }

    // PDFBox parses a whole document into the Java heap by default, which
    // OutOfMemory-killed the app on a 161-page CAD drawing set (the process
    // dies, so the app appears to "crash and restart"). The mixed setting
    // keeps a 32 MB working budget in memory and spills the rest to a scratch
    // file in the cache dir, so document size no longer decides whether search
    // survives. Two extractions can also run at once (search + text layout),
    // which doubled the old heap cost.
    private PDDocument openPdDocumentForExtraction() throws Exception {
        MemoryUsageSetting mem = MemoryUsageSetting.setupMixed(32L * 1024 * 1024);
        try {
            File scratch = new File(getCacheDir(), "pdfbox");
            if (scratch.isDirectory() || scratch.mkdirs()) mem = mem.setTempDir(scratch);
        } catch (Exception ignored) {
            // Fall back to the platform temp dir.
        }
        File source = resolveLocalFileForExtraction();
        // PDFBox keeps the parsed object tree on the Java heap. Past a quarter
        // of the heap (128 MB on the S23) that is not safe: even when the
        // parse itself survives, it can starve the viewer's own render thread,
        // and an OutOfMemoryError there cannot be caught. Refuse up front with
        // a clear message rather than gamble. Viewing, search, text selection
        // and bookmarks do not use PDFBox and keep working at any size.
        if (source.length() > pdfBoxMaxBytes()) {
            throw new java.io.IOException(PDF_TOO_LARGE_MESSAGE);
        }
        try {
            return PDDocument.load(source, mem);
        } catch (OutOfMemoryError e) {
            // Confirmed on the S23 with a 285 MB PDF: PDFBox's object tree
            // alone filled the 512 MB heap, and an OutOfMemoryError escaping a
            // worker thread killed the whole process ("app restarts"). The
            // half-parsed document is garbage once we leave here, so turning
            // it into an ordinary exception lets every caller's existing
            // failure path (toast / empty result) handle it.
            throw new java.io.IOException(PDF_TOO_LARGE_MESSAGE, e);
        }
    }

    static final String PDF_TOO_LARGE_MESSAGE =
            "This PDF is too large to edit on a phone. Reading, search and bookmarks still work.";

    private static long pdfBoxMaxBytes() {
        return Runtime.getRuntime().maxMemory() / 4;
    }

    // True when a PDFBox-based tool would be refused (see
    // openPdDocumentForExtraction). Used to tell the user before they spend
    // time placing a signature or marking areas that could never be saved.
    private boolean isTooLargeForPdfBox() {
        try {
            if (pdfPath == null) return false;
            File f;
            if (pdfPath.startsWith("content://")) {
                f = cachedContentCopyFile;
                if (f == null) return false;
            } else {
                f = pdfPath.startsWith("file://") ? new File(Uri.parse(pdfPath).getPath()) : new File(pdfPath);
            }
            return f.length() > pdfBoxMaxBytes();
        } catch (Exception e) {
            return false;
        }
    }

    // Above this size PDFBox is not parsed up front on open; text tools still
    // try on demand and fail with a message instead of taking the app down.
    private static final long PDFBOX_WARM_MAX_BYTES = 60L * 1024 * 1024;

    private boolean isTooLargeToWarmPdfBox() {
        try {
            if (pdfPath == null || pdfPath.startsWith("content://")) return false;
            File f = pdfPath.startsWith("file://") ? new File(Uri.parse(pdfPath).getPath()) : new File(pdfPath);
            return f.length() > PDFBOX_WARM_MAX_BYTES;
        } catch (Exception e) {
            return false;
        }
    }

    // Extracts every page's text once (background thread -- PDFBox parsing
    // is too slow for the main thread on anything but tiny documents) and
    // caches it, then runs onReady on the main thread. Safe to call
    // repeatedly -- later calls just reuse the cache.
    // Pages whose extracted text is too thin to be the real page content --
    // candidates for OCR if a plain search comes up empty.
    private List<Integer> pageTextsSparsePages = null;
    // Set once deep search has already OCR'd this document, so a second
    // search doesn't offer (or redo) it.
    private boolean deepSearchDone = false;

    // A CAD export typically plots its text as vector outlines and leaves only
    // a logo or title behind as real text -- 71 characters on a full A1 sheet,
    // in the case that turned this up. The old "is it completely empty?" test
    // saw that as a page with text and skipped OCR, so the document was
    // unsearchable with no explanation. Anything this thin is treated as
    // "probably not the real content" instead.
    private static final int SPARSE_PAGE_CHAR_LIMIT = 160;
    // Up to this many sparse pages, OCR runs silently as part of the search
    // (a few seconds); beyond it, the wait is long enough to ask first.
    private static final int AUTO_OCR_PAGE_LIMIT = 5;

    private boolean isPageTextSparse(String text) {
        return text == null || text.replaceAll("\\s+", "").length() < SPARSE_PAGE_CHAR_LIMIT;
    }

    // Reports "page N of M" while a long extraction runs, so a search on a big
    // document shows movement instead of a motionless "Searching…".
    interface ExtractionProgress {
        void onProgress(int done, int total);
    }

    private void reportProgress(ExtractionProgress progress, final int done, final int total) {
        if (progress == null) return;
        final ExtractionProgress p = progress;
        mainHandler.post(new Runnable() {
            @Override
            public void run() { p.onProgress(done, total); }
        });
    }

    // Asks PdfTextService -- a SEPARATE PROCESS, see that class for why -- to
    // read every page's text with pdfium, and blocks this background thread
    // until it answers. pdfium streams a page at a time from the file, so a
    // 300 MB drawing set costs no more memory than a small one. Returns null
    // if the service could not read it; the caller then falls back to PDFBox.
    // Set while a search is running so the extractor can report hits live.
    private volatile String liveSearchQuery = null;

    // A page matched while the document is still being read: show it straight
    // away. The first hit also jumps there, so on a long document the reader is
    // already at a result while the rest keeps scanning.
    private void onLiveMatch(int page) {
        if (extractionCancelled) return;
        if (currentMatchPages == null) currentMatchPages = new ArrayList<>();
        if (currentMatchPages.contains(page)) return;
        currentMatchPages.add(page);
        if (currentMatchPages.size() == 1) {
            currentMatchIndex = 0;
            setSearchStepEnabled(true);
            jumpToCurrentMatch();
        } else {
            updateSearchLabel();
        }
    }

    private List<String> extractAllPageTextsWithPdfium(final ExtractionProgress progress) {
        final java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        final String[] resultPath = new String[1];
        final Messenger[] service = new Messenger[1];

        final Messenger replyTo = new Messenger(new Handler(Looper.getMainLooper(), new Handler.Callback() {
            @Override
            public boolean handleMessage(Message msg) {
                if (msg.what == PdfTextService.MSG_PROGRESS) {
                    if (progress != null) progress.onProgress(msg.arg1, msg.arg2);
                    return true;
                }
                if (msg.what == PdfTextService.MSG_MATCH) {
                    // The hit carries its own position, so the highlight can be
                    // drawn the moment the viewer jumps there.
                    Bundle b = msg.getData();
                    float[] box = b == null ? null : b.getFloatArray(PdfTextService.KEY_MATCH_BOX);
                    if (box != null && box.length == 4 && textSelectionOverlay != null) {
                        // Straight to the overlay: no cache, no layout, nothing
                        // to wait for. The page's full character map replaces it
                        // when it arrives.
                        textSelectionOverlay.setQuickSearchRect(msg.arg1, box[0], box[1], box[2], box[3],
                                b.getFloat(PdfTextService.KEY_PAGE_W, 0f),
                                b.getFloat(PdfTextService.KEY_PAGE_H, 0f));
                    }
                    onLiveMatch(msg.arg1);
                    return true;
                }
                if (msg.what == PdfTextService.MSG_DONE) {
                    resultPath[0] = msg.getData().getString(PdfTextService.KEY_RESULT_PATH);
                }
                if (msg.what == PdfTextService.MSG_DONE || msg.what == PdfTextService.MSG_ERROR) {
                    done.countDown();
                }
                return true;
            }
        }));

        final File file;
        try {
            file = resolveLocalFileForExtraction();
        } catch (Exception e) {
            return null;
        }

        ServiceConnection conn = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                service[0] = new Messenger(binder);
                Message m = Message.obtain(null, PdfTextService.MSG_START);
                Bundle data = new Bundle();
                data.putString(PdfTextService.KEY_PDF_PATH, file.getAbsolutePath());
                data.putString(PdfTextService.KEY_PASSWORD, pendingPassword);
                data.putString(PdfTextService.KEY_QUERY, liveSearchQuery);
                m.setData(data);
                m.replyTo = replyTo;
                try {
                    service[0].send(m);
                } catch (RemoteException e) {
                    done.countDown();
                }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                // The extractor process died on a file even pdfium cannot take.
                // Unblock rather than wait forever; the viewer is untouched.
                done.countDown();
            }
        };

        boolean bound = false;
        try {
            bound = bindService(new Intent(this, PdfTextService.class), conn, BIND_AUTO_CREATE);
            if (!bound) return null;
            while (!done.await(150, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                if (extractionCancelled) {
                    if (service[0] != null) {
                        try {
                            service[0].send(Message.obtain(null, PdfTextService.MSG_CANCEL));
                        } catch (RemoteException ignored) { }
                    }
                    return null;
                }
            }
            return resultPath[0] == null ? null : readExtractedTexts(new File(resultPath[0]));
        } catch (Throwable e) {
            android.util.Log.w("DocmanSearch", "text service failed", e);
            return null;
        } finally {
            if (bound) { try { unbindService(conn); } catch (Exception ignored) { } }
        }
    }

    // One page's character boxes from PdfTextService. PDFBox had to parse the
    // WHOLE document before it could report a single character's position,
    // which is the pause between jumping to a search hit and seeing the word
    // highlighted (and an out-of-memory risk on a 300 MB file). pdfium reads
    // just this page. Returns null if the service could not answer, and the
    // caller falls back to the PDFBox path below it.
    private PageTextLayout pageLayoutFromPdfium(final int pageIndex) {
        final java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        final PageTextLayout[] result = new PageTextLayout[1];

        final Messenger replyTo = new Messenger(new Handler(Looper.getMainLooper(), new Handler.Callback() {
            @Override
            public boolean handleMessage(Message msg) {
                if (msg.what == PdfTextService.MSG_LAYOUT_DONE) {
                    Bundle b = msg.getData();
                    String chars = b.getString(PdfTextService.KEY_CHARS, "");
                    float[] boxes = b.getFloatArray(PdfTextService.KEY_BOXES);
                    PageTextLayout l = new PageTextLayout();
                    l.pageWidthPts = b.getFloat(PdfTextService.KEY_PAGE_W, 0f);
                    l.pageHeightPts = b.getFloat(PdfTextService.KEY_PAGE_H, 0f);
                    if (boxes != null) {
                        int n = Math.min(chars.length(), boxes.length / 4);
                        for (int i = 0; i < n; i++) {
                            l.chars.add(new CharBox(String.valueOf(chars.charAt(i)),
                                    boxes[i * 4], boxes[i * 4 + 1], boxes[i * 4 + 2], boxes[i * 4 + 3]));
                        }
                    }
                    result[0] = l;
                }
                if (msg.what == PdfTextService.MSG_LAYOUT_DONE || msg.what == PdfTextService.MSG_ERROR) {
                    done.countDown();
                }
                return true;
            }
        }));

        final File file;
        try {
            file = resolveLocalFileForExtraction();
        } catch (Exception e) {
            return null;
        }

        ServiceConnection conn = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                Message m = Message.obtain(null, PdfTextService.MSG_PAGE_LAYOUT);
                Bundle data = new Bundle();
                data.putString(PdfTextService.KEY_PDF_PATH, file.getAbsolutePath());
                data.putString(PdfTextService.KEY_PASSWORD, pendingPassword);
                data.putInt(PdfTextService.KEY_PAGE, pageIndex);
                m.setData(data);
                m.replyTo = replyTo;
                try { new Messenger(binder).send(m); } catch (RemoteException e) { done.countDown(); }
            }

            @Override
            public void onServiceDisconnected(ComponentName name) { done.countDown(); }
        };

        boolean bound = false;
        try {
            bound = bindService(new Intent(this, PdfTextService.class), conn, BIND_AUTO_CREATE);
            if (!bound) return null;
            if (!done.await(20, java.util.concurrent.TimeUnit.SECONDS)) return null;
            return result[0];
        } catch (Throwable e) {
            return null;
        } finally {
            if (bound) { try { unbindService(conn); } catch (Exception ignored) { } }
        }
    }

    // Reads back what PdfTextService wrote: page count, then each page's text
    // as a length-prefixed UTF-8 block. Binder's ~1 MB transaction limit rules
    // out sending a whole document's text across directly.
    private List<String> readExtractedTexts(File f) {
        java.io.DataInputStream in = null;
        try {
            in = new java.io.DataInputStream(new java.io.BufferedInputStream(
                    new java.io.FileInputStream(f), 64 * 1024));
            int pages = in.readInt();
            List<String> texts = new ArrayList<>(Math.max(0, pages));
            for (int i = 0; i < pages; i++) {
                int len = in.readInt();
                byte[] buf = new byte[len];
                in.readFully(buf);
                texts.add(new String(buf, "UTF-8"));
            }
            return texts;
        } catch (Throwable e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (Exception ignored) { } }
            f.delete();
        }
    }

    // The original PDFBox path, now only a fallback. Returns null if it fails.
    private List<String> extractAllPageTextsWithPdfBox(ExtractionProgress progress) {
        PDDocument doc = null;
        try {
            List<String> texts = new ArrayList<>();
            doc = openPdDocumentForExtraction();
            final int pageCount = doc.getNumberOfPages();
            long lastReport = 0L;
            for (int i = 1; i <= pageCount; i++) {
                if (extractionCancelled) return null;
                long now = SystemClock.uptimeMillis();
                if (now - lastReport > 120 || i == pageCount) {
                    lastReport = now;
                    reportProgress(progress, i, pageCount);
                }
                String text = "";
                try {
                    PDFTextStripper stripper = new PDFTextStripper();
                    stripper.setStartPage(i);
                    stripper.setEndPage(i);
                    text = stripper.getText(doc);
                } catch (Exception pageErr) {
                    // Per page, not per document: one unparseable page used to
                    // abort the loop and leave every later page unsearchable.
                }
                texts.add(text == null ? "" : text);
            }
            return texts;
        } catch (Throwable e) {
            return null;
        } finally {
            if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
        }
    }

    // ---- remembered page text -------------------------------------------
    // Reading a 2000-page set takes minutes, and it used to be thrown away when
    // the viewer closed, so every visit paid it again. The result is kept in the
    // cache directory, keyed by the file's path, size and timestamp, so editing
    // or replacing the document invalidates it by itself.
    private File textCacheFile() {
        try {
            File f = new File(pdfPath.startsWith("file://") ? Uri.parse(pdfPath).getPath() : pdfPath);
            String key = (f.getAbsolutePath() + "|" + f.length() + "|" + f.lastModified());
            File dir = new File(getCacheDir(), "pagetext");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            return new File(dir, "t" + Integer.toHexString(key.hashCode()) + ".bin");
        } catch (Exception e) {
            return null;
        }
    }

    private List<String> loadTextCache() {
        File f = textCacheFile();
        if (f == null || !f.isFile()) return null;
        java.io.DataInputStream in = null;
        try {
            in = new java.io.DataInputStream(new java.io.BufferedInputStream(
                    new java.io.FileInputStream(f), 64 * 1024));
            int pages = in.readInt();
            if (pages <= 0 || pages > 100000) return null;
            List<String> texts = new ArrayList<>(pages);
            for (int i = 0; i < pages; i++) {
                int len = in.readInt();
                byte[] buf = new byte[len];
                in.readFully(buf);
                texts.add(new String(buf, "UTF-8"));
            }
            return texts;
        } catch (Throwable e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (Exception ignored) { } }
        }
    }

    private void saveTextCache(List<String> texts) {
        File f = textCacheFile();
        if (f == null || texts == null || texts.isEmpty()) return;
        java.io.DataOutputStream out = null;
        try {
            out = new java.io.DataOutputStream(new java.io.BufferedOutputStream(
                    new java.io.FileOutputStream(f), 64 * 1024));
            out.writeInt(texts.size());
            for (String t : texts) {
                byte[] b = (t == null ? "" : t).getBytes("UTF-8");
                out.writeInt(b.length);
                out.write(b);
            }
            out.flush();
        } catch (Throwable e) {
            if (f.exists()) f.delete();
        } finally {
            if (out != null) { try { out.close(); } catch (Exception ignored) { } }
        }
    }

    private void ensurePageTextsExtracted(final Runnable onReady) {
        ensurePageTextsExtracted(onReady, null);
    }

    private void ensurePageTextsExtracted(final Runnable onReady, final ExtractionProgress progress) {
        if (pageTextsCache != null) { onReady.run(); return; }
        // Deliberately NOT thumbnailExecutor: that single thread is already
        // carrying page-layout and OCR work queued by every page change, so a
        // search sat behind minutes of it showing "Opening file..." while
        // nothing of its own had started yet (reported 2026-09-23).
        if (searchExecutor == null || searchExecutor.isShutdown()) return;
        searchExecutor.execute(new Runnable() {
            @Override
            public void run() {
                // Already read on an earlier visit? Then there is nothing to do.
                List<String> texts = loadTextCache();
                if (texts == null) texts = extractAllPageTextsWithPdfium(progress);
                else if (progress != null) reportProgress(progress, texts.size(), texts.size());
                if (texts == null) {
                    // pdfium could not open it at all (rare: it renders this
                    // same file). Fall back to PDFBox, which handles some
                    // damaged files pdfium rejects but needs the whole
                    // document in memory.
                    texts = extractAllPageTextsWithPdfBox(progress);
                }
                if (texts == null || extractionCancelled) return;
                List<Integer> sparsePages = new ArrayList<>();
                for (int i = 0; i < texts.size(); i++) {
                    if (isPageTextSparse(texts.get(i))) sparsePages.add(i);
                }
                pageTextsCache = texts;
                pageTextsSparsePages = sparsePages;
                saveTextCache(texts);
                mainHandler.post(onReady);
            }
        });
    }

    // Same PDFBox-based approach as ensurePageTextsExtracted above, but walks
    // PDFTextStripper's per-character callback to capture each glyph's own
    // bounding box (needed to place selection highlight rectangles) instead
    // of just the page's plain text. Kept as its own cache/pass rather than
    // folding into ensurePageTextsExtracted to avoid touching the working
    // search/copy-page-text path.
    //
    // Extracts exactly ONE page, on demand, rather than the whole document up
    // front -- a full pass used to run PDFTextStripper over every page before
    // ANY page could be selected, which on a large (400+ page) document meant
    // long-press silently did nothing for a long time (the "touch not
    // working" report). pageTextLayoutCache is pre-sized with a null per page
    // in bookmarksLoader.loadComplete(); this fills in one slot the first
    // time PdfTextSelectionOverlayView asks for that page (see its
    // OnSelectionListener.onPageTextNeeded), so selection on whichever page
    // someone is actually looking at is fast regardless of document length.
    private void ensurePageTextLayoutForPage(final int pageIndex, final Runnable onReady) {
        if (pageTextLayoutCache != null && pageIndex >= 0 && pageIndex < pageTextLayoutCache.size()
                && pageTextLayoutCache.get(pageIndex) != null) {
            PageTextLayout cached = pageTextLayoutCache.get(pageIndex);
            int glyphs = 0;
            for (CharBox c : cached.chars) {
                if (c.ch != null && !c.ch.trim().isEmpty()) glyphs++;
            }
            boolean needsOcr = glyphs < SPARSE_PAGE_CHAR_LIMIT && !cached.ocrDone
                    && !prefetchOnly && (isPro || ocrUnlockedThisVisit);
            if (cached.partial) {
                // Hold the search hit's own box: draw the highlight NOW from it,
                // then quietly replace it with the page's full character map so
                // text selection works too. Rebuilding first left the reader on
                // an un-highlighted page for as long as that took.
                onReady.run();
                if (!prefetchOnly && !cached.rebuildQueued) {
                    cached.rebuildQueued = true;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (pageTextLayoutCache == null || pageIndex >= pageTextLayoutCache.size()) return;
                            PageTextLayout still = pageTextLayoutCache.get(pageIndex);
                            if (still == null || !still.partial) return;
                            pageTextLayoutCache.set(pageIndex, null);
                            ensurePageTextLayoutForPage(pageIndex, NO_OP);
                        }
                    });
                }
                return;
            }
            if (!needsOcr) {
                onReady.run();
                return;
            }
            // Fall through and rebuild this page WITH the image pass.
            pageTextLayoutCache.set(pageIndex, null);
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        final boolean prefetchThisTask = prefetchOnly;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                // Every page change queues a prefetch for three pages on this
                // single thread. A fast scroll through a 4000-page file left
                // thousands queued, each asking the text service for a page
                // the reader had long passed, and a real long-press waited
                // behind all of them ("selection doesn't work after
                // scrolling"). A prefetch for a page no longer near the
                // screen is dropped here at no cost.
                if (prefetchThisTask && Math.abs(pageIndex - lastKnownPage) > 2) return;
                PageTextLayout fast = pageLayoutFromPdfium(pageIndex);
                // TEMP: compare the new engine's character boxes with the old
                // one's for the same page, to find the misplaced highlight.
                if (fast != null && !fast.chars.isEmpty()) {
                    StringBuilder dbg = new StringBuilder("pdfium page=" + pageIndex
                            + " size=" + fast.pageWidthPts + "x" + fast.pageHeightPts);
                    for (int i = 0; i < Math.min(6, fast.chars.size()); i++) {
                        CharBox c = fast.chars.get(i);
                        dbg.append(" | '").append(c.ch).append("' x=").append(Math.round(c.x))
                           .append(" y=").append(Math.round(c.y)).append(" w=").append(Math.round(c.width))
                           .append(" h=").append(Math.round(c.height));
                    }
                    android.util.Log.i("DOCMANBOX", dbg.toString());
                }
                // A page with no real text at all (every label drawn as lines)
                // used to fall through to PDFBox for its OCR pass. PDFBox is
                // refused for very large files, so read such a page with OCR
                // right here instead.
                final boolean bigFile = isTooLargeForPdfBox();
                if (fast != null && fast.chars.isEmpty() && bigFile && fast.pageWidthPts > 0
                        && !prefetchThisTask && (isPro || ocrUnlockedThisVisit)) {
                    runOcrFallback(fast, pageIndex);
                    fast.ocrDone = true;
                }
                if (fast != null && fast.chars.isEmpty() && bigFile && fast.pageWidthPts > 0) {
                    if (pageTextLayoutCache != null && pageIndex >= 0 && pageIndex < pageTextLayoutCache.size()) {
                        pageTextLayoutCache.set(pageIndex, fast);
                    }
                    mainHandler.post(onReady);
                    return;
                }
                if (fast != null && !fast.chars.isEmpty()) {
                    // A CAD sheet carries a few real characters (a title block
                    // line) while every tag on the drawing is vector outlines.
                    // Accepting those few characters used to skip the OCR that
                    // search relies on, so the viewer jumped to a match it then
                    // could not highlight. Same sparse test the PDFBox path uses.
                    int glyphs = 0;
                    for (CharBox c : fast.chars) {
                        if (c.ch != null && !c.ch.trim().isEmpty()) glyphs++;
                    }
                    if (!prefetchThisTask && glyphs < SPARSE_PAGE_CHAR_LIMIT
                            && (isPro || ocrUnlockedThisVisit)) {
                        runOcrFallback(fast, pageIndex);
                        fast.ocrDone = true;
                    }
                }
                if (fast != null && !fast.chars.isEmpty()) {
                    if (pageTextLayoutCache != null && pageIndex >= 0 && pageIndex < pageTextLayoutCache.size()) {
                        pageTextLayoutCache.set(pageIndex, fast);
                        trimDistantTextLayouts(pageIndex);
                    }
                    mainHandler.post(onReady);
                    return;
                }
                // Scrolling a large scanned PDF would otherwise fall through to
                // a full PDFBox parse on the first page change (see
                // warmTextLayoutDocument). Only a real selection pays for it.
                if (prefetchThisTask && isTooLargeToWarmPdfBox()) return;
                final PageTextLayout layout = new PageTextLayout();
                try {
                    if (textLayoutDoc == null) {
                        textLayoutDoc = openPdDocumentForExtraction();
                    }
                    PDDocument doc = textLayoutDoc;
                    if (pageIndex >= 0 && pageIndex < doc.getNumberOfPages()) {
                        PDPage page = doc.getPage(pageIndex);
                        PDRectangle box = page.getMediaBox();
                        int rotation = page.getRotation();
                        boolean swapped = rotation == 90 || rotation == 270;
                        layout.pageWidthPts = swapped ? box.getHeight() : box.getWidth();
                        layout.pageHeightPts = swapped ? box.getWidth() : box.getHeight();

                        PDFTextStripper stripper = new PDFTextStripper() {
                            @Override
                            protected void writeString(String text, List<TextPosition> textPositions) {
                                for (TextPosition tp : textPositions) {
                                    // getYDirAdj() is the BASELINE, not the top of
                                    // the glyph. CharBox.y is documented as the top
                                    // (and the OCR path below supplies a real
                                    // top-left box from ML Kit), so subtract the
                                    // height here rather than leaving every consumer
                                    // to know the difference. Without this the
                                    // selection band, saved highlight annotations
                                    // and search highlighting all draw one line-
                                    // height too low -- under the words instead of
                                    // over them.
                                    layout.chars.add(new CharBox(
                                            tp.getUnicode(),
                                            tp.getXDirAdj(),
                                            tp.getYDirAdj() - tp.getHeightDir(),
                                            tp.getWidthDirAdj(),
                                            tp.getHeightDir()));
                                }
                            }
                        };
                        stripper.setSortByPosition(true);
                        stripper.setStartPage(pageIndex + 1);
                        stripper.setEndPage(pageIndex + 1);
                        stripper.getText(doc);

                        // Nothing extracted -- almost certainly a scanned/
                        // image-only page (a photocopied contract, a faxed
                        // form, a scanned receipt) rather than an empty one,
                        // since real pages with visible content always have
                        // SOME text object unless they're pure images. Falls
                        // back to on-device OCR so selection/highlight still
                        // works, rather than silently doing nothing the way
                        // every text feature used to on this class of PDF.
                        // Sparse, not just empty -- same reasoning as
                        // isPageTextSparse(): a CAD sheet whose text is really
                        // vector outlines still yields a handful of characters
                        // from its logo, and "not empty" wrongly counted that
                        // as a page with usable text. Selection and search
                        // highlighting then had no boxes for the words that
                        // are actually visible on the page.
                        int glyphCount = 0;
                        for (CharBox c : layout.chars) {
                            if (c.ch != null && !c.ch.trim().isEmpty()) glyphCount++;
                        }
                        if (glyphCount < SPARSE_PAGE_CHAR_LIMIT) {
                            // OCR is part of Pro. For a free user a scanned page behaves as it
                            // did before OCR existed: it opens and reads normally, its text just
                            // is not selectable. No prompt here -- this also runs for prefetch.
                            if (isPro || ocrUnlockedThisVisit) { runOcrFallback(layout, pageIndex); layout.ocrDone = true; }
                        }
                    }
                } catch (Exception e) {
                    // Leave layout as whatever was extracted before the
                    // failure (possibly empty) -- selection just won't work
                    // on this one page rather than crashing. textLayoutDoc is
                    // deliberately NOT closed/discarded here: a failure
                    // stripping one page shouldn't take down the ability to
                    // extract every other page too.
                }
                // pageTextLayoutCache is the SAME List instance the overlay
                // holds a reference to (passed once in setTextLayouts()), so
                // filling this slot in is immediately visible to it -- no
                // need to call setTextLayouts() again.
                if (pageTextLayoutCache != null && pageIndex >= 0 && pageIndex < pageTextLayoutCache.size()) {
                    pageTextLayoutCache.set(pageIndex, layout);
                    trimDistantTextLayouts(pageIndex);
                }
                mainHandler.post(onReady);
            }
        });
    }

    // Fire-and-forget version of ensurePageTextLayoutForPage() above -- warms
    // the cache ahead of an actual selection attempt (see this class's
    // onPageChanged/loadComplete call sites) instead of reacting to one, so
    // long-press feels instant on a page someone's already been sitting on
    // for a moment. Silently does nothing for an out-of-range page (e.g.
    // prefetching page-1 from page 0) or a page that's already cached.
    private static final Runnable NO_OP = new Runnable() {
        @Override public void run() { }
    };
    // Kicks off just the expensive part -- PDFBox's PDDocument.load(), which
    // parses the WHOLE document's structure up front -- without waiting for
    // pageTextLayoutCache to be sized (that needs pdfium's own page count,
    // which isn't known yet this early). Measured on-device: for a large,
    // dense multi-hundred-page document this parse alone can take 10+
    // seconds, while every subsequent per-page extraction is 20-100ms
    // (confirmed: not a content:// I/O problem, and PDFBox already defaults
    // to main-memory-only buffering -- this appears to be an inherent cost
    // of PDFBox's Java parser working through that many pages/objects on a
    // mobile CPU). Nothing to be done about that cost itself short of a
    // different parsing engine, so the best available mitigation is
    // starting it as early as possible -- called from onCreate, running
    // concurrently with PDFView's own async pdfium load, instead of only
    // starting once pdfium finishes AND someone tries to select text.
    private void warmTextLayoutDocument() {
        if (textLayoutDoc != null) return;
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        // A very large file is not worth parsing just in case someone selects
        // text: on a 285 MB PDF this warm-up is what ran the app out of memory.
        if (isTooLargeToWarmPdfBox()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    if (textLayoutDoc == null) {
                        textLayoutDoc = openPdDocumentForExtraction();
                    }
                } catch (Throwable e) {
                    // Leave textLayoutDoc null -- the next real
                    // ensurePageTextLayoutForPage() call will just retry the
                    // open itself and surface the failure there instead.
                }
            }
        });
    }

    // Scanned pages whose text layout was built before this visit's free OCR
    // try was used hold no words -- OCR was off then. Drop them (same List
    // instance the selection overlay holds) so the next highlight, search
    // match or text selection on those pages rebuilds them with OCR.
    private void forgetLayoutsBuiltWithoutOcr() {
        if (pageTextLayoutCache == null) return;
        for (int i = 0; i < pageTextLayoutCache.size(); i++) {
            if (pageTextsSparsePages == null || pageTextsSparsePages.contains(i)) {
                pageTextLayoutCache.set(i, null);
            }
        }
    }

    // A page's layout is one CharBox per character -- a few hundred KB on a
    // dense page. They are only built for pages the reader actually touches,
    // but working through a 400-page manual with selection or highlight would
    // otherwise keep every one of them alive for the whole session. Pages
    // further than this from the one just built are dropped; coming back to
    // them simply rebuilds the layout.
    private static final int TEXT_LAYOUT_KEEP_RADIUS = 15;

    private void trimDistantTextLayouts(int aroundPage) {
        if (pageTextLayoutCache == null) return;
        for (int i = 0; i < pageTextLayoutCache.size(); i++) {
            if (Math.abs(i - aroundPage) > TEXT_LAYOUT_KEEP_RADIUS && pageTextLayoutCache.get(i) != null) {
                pageTextLayoutCache.set(i, null);
            }
        }
    }

    private void prefetchPageTextLayout(int page) {
        if (pageTextLayoutCache == null || page < 0 || page >= pageTextLayoutCache.size()) return;
        if (pageTextLayoutCache.get(page) != null) return;
        // Warm the real text only. Reading a page as an image (OCR) takes
        // seconds; doing it for three pages on every page change filled the
        // background queue and stalled everything behind it.
        prefetchOnly = true;
        try {
            ensurePageTextLayoutForPage(page, NO_OP);
        } finally {
            prefetchOnly = false;
        }
    }
    // True while a prefetch (not a user-visible request) is being queued.
    private volatile boolean prefetchOnly = false;

    // ============================================================
    // ATTACHMENTS -- files embedded in the PDF itself, distinct from a
    // regular page image/link. Two places PDFBox surfaces them: the
    // document-level embedded-files name tree (what most readers show as an
    // "Attachments" panel) and per-page FileAttachment annotations (the
    // paperclip icon dropped on a page). Both funnel into the same cache.
    // ============================================================

    private void ensureAttachmentsExtracted(final Runnable onReady) {
        if (attachmentsCache != null) { onReady.run(); return; }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                List<AttachmentInfo> found = new ArrayList<>();
                PDDocument doc = null;
                try {
                    doc = openPdDocumentForExtraction();

                    PDDocumentNameDictionary names = doc.getDocumentCatalog().getNames();
                    if (names != null) {
                        PDEmbeddedFilesNameTreeNode efTree = names.getEmbeddedFiles();
                        if (efTree != null) {
                            collectEmbeddedFiles(efTree, found);
                        }
                    }

                    for (PDPage page : doc.getPages()) {
                        for (PDAnnotation annotation : page.getAnnotations()) {
                            if (annotation instanceof PDAnnotationFileAttachment) {
                                PDFileSpecification fileSpec = ((PDAnnotationFileAttachment) annotation).getFile();
                                addAttachment(fileSpec, null, found);
                            }
                        }
                    }
                } catch (Exception e) {
                    // Leave whatever was found before the failure -- same
                    // partial-result tolerance as the extraction passes above.
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                attachmentsCache = found;
                mainHandler.post(onReady);
            }
        });
    }

    // Name trees are, well, trees -- a node either holds Names directly or
    // Kids pointing at child nodes (never both). Recurses into Kids so
    // documents that spread their embedded files across multiple nodes
    // (common once there are enough of them) aren't missed.
    private void collectEmbeddedFiles(PDNameTreeNode<PDComplexFileSpecification> node, List<AttachmentInfo> out) throws java.io.IOException {
        Map<String, PDComplexFileSpecification> names = node.getNames();
        if (names != null) {
            for (Map.Entry<String, PDComplexFileSpecification> entry : names.entrySet()) {
                addAttachment(entry.getValue(), entry.getKey(), out);
            }
        }
        List<PDNameTreeNode<PDComplexFileSpecification>> kids = node.getKids();
        if (kids != null) {
            for (PDNameTreeNode<PDComplexFileSpecification> kid : kids) {
                collectEmbeddedFiles(kid, out);
            }
        }
    }

    private void addAttachment(PDFileSpecification spec, String fallbackName, List<AttachmentInfo> out) {
        if (!(spec instanceof PDComplexFileSpecification)) return;
        PDComplexFileSpecification complex = (PDComplexFileSpecification) spec;
        PDEmbeddedFile embedded = complex.getEmbeddedFile();
        if (embedded == null) return;
        String name = complex.getFilename();
        if (name == null || name.trim().isEmpty()) name = fallbackName;
        if (name == null || name.trim().isEmpty()) name = "attachment_" + (out.size() + 1);
        try {
            out.add(new AttachmentInfo(name, embedded.toByteArray()));
        } catch (Exception e) {
            // Skip this one attachment rather than aborting the whole scan.
        }
    }

    private void showAttachmentsDialog() {
        // Attachments are read with PDFBox; without this a very large file
        // would wrongly report "No attachments".
        if (isTooLargeForPdfBox()) {
            showNotice(NOTICE_INFO, "File too large", "Attachments can't be read from a PDF this large on a phone");
            return;
        }
        ensureAttachmentsExtracted(new Runnable() {
            @Override
            public void run() {
                if (attachmentsCache == null || attachmentsCache.isEmpty()) {
                    showNotice(NOTICE_INFO, "No attachments", "This document has no attached files");
                    return;
                }
                final List<AttachmentInfo> attachments = attachmentsCache;
                String[] labels = new String[attachments.size()];
                for (int i = 0; i < attachments.size(); i++) {
                    labels[i] = attachments.get(i).name;
                }
                new AlertDialog.Builder(PdfViewerActivity.this, R.style.PdfDialogTheme)
                        .setTitle("Attachments")
                        .setItems(labels, new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                dialog.dismiss();
                                saveAttachmentToDownloads(attachments.get(which));
                            }
                        })
                        .show();
            }
        });
    }

    // Same MediaStore/Downloads mechanism as exportToDownloads -- a durable,
    // permission-free (Android 10+) place to hand the person their file.
    private void saveAttachmentToDownloads(AttachmentInfo attachment) {
        String mimeType = "application/octet-stream";
        int dot = attachment.name.lastIndexOf('.');
        if (dot >= 0 && dot < attachment.name.length() - 1) {
            String ext = attachment.name.substring(dot + 1).toLowerCase();
            String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (guessed != null) mimeType = guessed;
        }

        try {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, attachment.name);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

            Uri dest = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) {
                showNotice(NOTICE_ERROR, "Could not save to Downloads", "The file could not be created");
                return;
            }
            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) {
                showNotice(NOTICE_ERROR, "Could not save to Downloads", "Writing the file failed");
                return;
            }
            out.write(attachment.data);
            out.flush();
            out.close();
            showNotice(NOTICE_OK, "Saved to Downloads", attachment.name);
        } catch (Exception e) {
            showNotice(NOTICE_ERROR, "Could not save to Downloads", e.getMessage());
        }
    }

    // ============================================================
    // HIGHLIGHT (annotation editing) -- turns text selections into real
    // Highlight annotations written into the PDF. Tapping "Highlight" only
    // colors the selection on screen (see PdfTextSelectionOverlayView's
    // committedHighlights) -- nothing is written to storage until the person
    // actually leaves the viewer, at which point confirmExitAndFinish() asks
    // whether to save. Always saves a new copy to Downloads rather than
    // touching the original file: safer (no risk to the person's source PDF
    // if a write fails partway) and necessary anyway, since a PDF opened
    // from Drive/Files often can't be overwritten in place.
    // ============================================================

    private void highlightSelection() {
        if (!textSelectionOverlay.hasSelection()) {
            showNotice(NOTICE_INFO, "Nothing selected", null);
            return;
        }
        textSelectionOverlay.commitHighlight();
    }

    // Asks whether to save pending highlights before leaving, only if there
    // are any -- otherwise leaves immediately, same as before this feature
    // existed. Wired to both the back button and the system back
    // gesture/button (see the OnBackPressedCallback in onCreate).
    private void confirmExitAndFinish() {
        if (!textSelectionOverlay.hasCommittedHighlights()) {
            finish();
            return;
        }
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Save highlights?")
                .setMessage("You highlighted text in this document. Save a highlighted copy before leaving?")
                .setPositiveButton("Save", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        saveHighlightsToDownloadsThenFinish(textSelectionOverlay.getCommittedHighlights());
                    }
                })
                .setNegativeButton("Discard", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        finish();
                    }
                })
                .setNeutralButton("Cancel", null)
                .show();
    }

    // Writes every pending highlight into one combined copy of the document,
    // saves it to Downloads, then finishes the Activity -- finish() happens
    // inside the completion callback (not right after execute()) so the
    // Activity, and the background executor it owns, stay alive until the
    // write actually completes.
    private void saveHighlightsToDownloadsThenFinish(final List<int[]> highlights) {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) {
            finish();
            return;
        }
        showNotice(NOTICE_BUSY, "Saving highlighted copy…", "Large PDFs can take a moment");

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                PDDocument doc = null;
                String resultMessage;
                try {
                    doc = openPdDocumentForExtraction();
                    int added = 0;
                    for (int[] h : highlights) {
                        int page = h[0], start = h[1], end = h[2];
                        if (pageTextLayoutCache == null || page < 0 || page >= pageTextLayoutCache.size()) continue;
                        PageTextLayout layout = pageTextLayoutCache.get(page);
                        int clampedEnd = Math.min(end, layout.chars.size() - 1);
                        float[] quadPoints = buildHighlightQuadPoints(layout, start, clampedEnd);
                        if (quadPoints.length == 0) continue;

                        PDAnnotationTextMarkup highlight =
                                new PDAnnotationTextMarkup(PDAnnotationTextMarkup.SUB_TYPE_HIGHLIGHT);
                        highlight.setQuadPoints(quadPoints);
                        highlight.setColor(new PDColor(new float[]{1f, 0.92f, 0.3f}, PDDeviceRGB.INSTANCE));
                        highlight.setConstantOpacity(0.4f);

                        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE;
                        float maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
                        for (int i = 0; i < quadPoints.length; i += 2) {
                            minX = Math.min(minX, quadPoints[i]);
                            maxX = Math.max(maxX, quadPoints[i]);
                            minY = Math.min(minY, quadPoints[i + 1]);
                            maxY = Math.max(maxY, quadPoints[i + 1]);
                        }
                        highlight.setRectangle(new PDRectangle(minX, minY, maxX - minX, maxY - minY));
                        // Bakes an actual appearance stream so the highlight
                        // shows up correctly in viewers that don't fall back
                        // to rendering from QuadPoints/Color alone.
                        highlight.constructAppearances(doc);

                        doc.getPage(page).getAnnotations().add(highlight);
                        added++;
                    }

                    if (added == 0) {
                        resultMessage = "Nothing to save";
                    } else {
                        String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                        if (baseName.toLowerCase().endsWith(".pdf")) {
                            baseName = baseName.substring(0, baseName.length() - 4);
                        }
                        resultMessage = saveEditedCopy(doc, baseName + "_highlighted.pdf");
                        spendFreeTryIfSaved("highlight", resultMessage);
                    }
                } catch (OutOfMemoryError e) {
                    // Confirmed via device crash log: PDDocument.save() re-
                    // serializing a large (400+ page) document in memory can
                    // exceed the heap. OutOfMemoryError is a Throwable, NOT an
                    // Exception -- catching only Exception here let it escape
                    // uncaught and take down the whole app process (looked
                    // like "the app restarted" from a plain back-press ->
                    // Save). Must be caught explicitly.
                    resultMessage = "Not enough memory to save this document's highlights (it's a large PDF)";
                } catch (Exception e) {
                    resultMessage = "Highlight save failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        // The viewer closes now; the app confirms a successful save itself.
                        if (!msg.startsWith("Saved in this folder")) Toast.makeText(PdfViewerActivity.this, msg, Toast.LENGTH_LONG).show();
                        finish();
                    }
                });
            }
        });
    }

    // Groups the selected characters into one QuadPoints quad per visual
    // line (a new group starts whenever a character's top-down y jumps by
    // more than half the previous character's height -- cheap proxy for
    // "wrapped to a new line") rather than one quad per character, so a
    // multi-word selection turns into a few clean rectangles like a real
    // highlighter instead of many overlapping slivers.
    private float[] buildHighlightQuadPoints(PageTextLayout layout, int start, int end) {
        List<Float> flat = new ArrayList<>();
        float groupMinX = 0, groupMaxX = 0, groupMinYTop = 0, groupMaxYBottom = 0;
        boolean groupOpen = false;
        float lastY = 0, lastHeight = 0;

        for (int i = start; i <= end; i++) {
            CharBox c = layout.chars.get(i);
            boolean sameLine = groupOpen && Math.abs(c.y - lastY) < lastHeight * 0.5f;
            if (groupOpen && !sameLine) {
                appendQuad(flat, groupMinX, groupMaxX, groupMinYTop, groupMaxYBottom, layout.pageHeightPts);
                groupOpen = false;
            }
            if (!groupOpen) {
                groupMinX = c.x;
                groupMaxX = c.x + c.width;
                groupMinYTop = c.y;
                groupMaxYBottom = c.y + c.height;
                groupOpen = true;
            } else {
                groupMinX = Math.min(groupMinX, c.x);
                groupMaxX = Math.max(groupMaxX, c.x + c.width);
                groupMinYTop = Math.min(groupMinYTop, c.y);
                groupMaxYBottom = Math.max(groupMaxYBottom, c.y + c.height);
            }
            lastY = c.y;
            if (c.height > 0) lastHeight = c.height;
        }
        if (groupOpen) {
            appendQuad(flat, groupMinX, groupMaxX, groupMinYTop, groupMaxYBottom, layout.pageHeightPts);
        }

        float[] result = new float[flat.size()];
        for (int i = 0; i < result.length; i++) result[i] = flat.get(i);
        return result;
    }

    // c.x/y/width/height are in PDFBox's top-down DirAdj space (see CharBox's
    // javadoc); PDF annotation QuadPoints are in the page's own bottom-up
    // space, so flip through the page's own height. Point order (top-left,
    // top-right, bottom-left, bottom-right) matches PDFBox's own
    // PDHighlightAppearanceHandler and Acrobat's de facto convention, NOT
    // the literal (and widely-ignored) PDF32000 spec text -- confirmed by
    // reading PDHighlightAppearanceHandler's own source, which draws the
    // fill path as points (4,5)->(0,1)->(2,3)->(6,7).
    private void appendQuad(List<Float> flat, float minX, float maxX, float minYTop, float maxYBottom, float pageHeightPts) {
        float bottomPdfY = pageHeightPts - maxYBottom;
        float topPdfY = pageHeightPts - minYTop;
        flat.add(minX); flat.add(topPdfY);
        flat.add(maxX); flat.add(topPdfY);
        flat.add(minX); flat.add(bottomPdfY);
        flat.add(maxX); flat.add(bottomPdfY);
    }

    // Serializes doc (with whatever's been added to it in memory) to a new
    // file in the public Downloads folder -- same MediaStore mechanism as
    // exportToDownloads/saveAttachmentToDownloads, just writing a PDDocument
    // instead of copying raw bytes.
    //
    // ============================================================
    // EDITED COPIES -- highlight, sign, fill form, redact and crop save a new
    // copy NEXT TO THE ORIGINAL inside DOCMAN, not in the phone's Downloads
    // folder, where most people never look. The verified PDF and a small
    // JSON note ({name, docId}) go to cache/edited/; the web layer
    // (importPendingEditedCopies in app.js) copies each into the original
    // document's folder with a native file copy and then deletes both. The
    // note is written last, so its presence means the PDF is complete, and
    // the web layer also checks at every launch -- a copy survives the app
    // being closed before it was filed. Export in the More menu still goes
    // to Downloads on purpose, and a document with no folder identity (no
    // docId) falls back to Downloads so an edit is never lost.
    // ============================================================
    private static final String EDITED_DIR = "edited";

    private String saveEditedCopy(PDDocument doc, String outName) {
        if (docId == null || !docId.contains("::")) {
            return saveDocumentCopyToDownloads(doc, outName);
        }
        File dir = new File(getCacheDir(), EDITED_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            return saveDocumentCopyToDownloads(doc, outName);
        }
        String base = "edited_" + System.currentTimeMillis();
        File pdf = new File(dir, base + ".pdf");
        File note = new File(dir, base + ".json");

        String error = writeVerifiedPdf(doc, pdf);
        if (error != null) {
            pdf.delete();
            return error;
        }
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("name", outName);
            o.put("docId", docId);
            java.io.FileOutputStream out = new java.io.FileOutputStream(note);
            try {
                out.write(o.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } finally {
                out.close();
            }
        } catch (Exception e) {
            pdf.delete();
            note.delete();
            return saveDocumentCopyToDownloads(doc, outName);
        }
        PdfNativePlugin.notifyEditedCopySaved();
        return "Saved in this folder as " + outName;
    }

    // Returns null on success, otherwise a message for the user.
    private String writeVerifiedPdf(PDDocument doc, File dest) {
        try {
            java.io.OutputStream out = new java.io.FileOutputStream(dest);
            try {
                doc.save(out);
            } finally {
                out.close();
            }
            if (dest.length() == 0) return "Save failed: produced an empty file";
            PDDocument verify = PDDocument.load(dest);
            try {
                if (verify.getNumberOfPages() <= 0) return "Save failed: output has no pages";
            } finally {
                verify.close();
            }
            return null;
        } catch (Exception e) {
            return "Save failed: " + e.getMessage();
        }
    }

    // Stages into a temp file in the app cache dir FIRST, verifies it's a
    // non-empty, actually-parseable PDF, and only then copies those
    // verified bytes into the final Downloads entry. The previous version
    // streamed doc.save() straight into the MediaStore Downloads Uri --
    // every caller of this method already catches OutOfMemoryError one
    // level up specifically because re-serializing a large document can
    // exceed the heap partway through, and with the old direct-write
    // approach that failure left a truncated, corrupt PDF sitting in the
    // person's Downloads folder. This way Downloads only ever shows the
    // complete output, never a partial one -- the OutOfMemoryError catch
    // that already exists in every caller still applies here unchanged,
    // since it's a Throwable, not an Exception, and isn't caught below.
    private String saveDocumentCopyToDownloads(PDDocument doc, String outName) {
        File tempFile = null;
        try {
            tempFile = File.createTempFile("pdf_save_", ".pdf", getCacheDir());
            java.io.OutputStream tempOut = new java.io.FileOutputStream(tempFile);
            try {
                doc.save(tempOut);
            } finally {
                tempOut.close();
            }

            if (tempFile.length() == 0) {
                return "Save failed: produced an empty file";
            }
            PDDocument verify = PDDocument.load(tempFile);
            try {
                if (verify.getNumberOfPages() <= 0) {
                    return "Save failed: output has no pages";
                }
            } finally {
                verify.close();
            }

            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, outName);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

            Uri dest = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) return "Could not create file in Downloads";

            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) return "Could not write to Downloads";
            java.io.InputStream in = null;
            try {
                in = new java.io.FileInputStream(tempFile);
                byte[] buf = new byte[64 * 1024];
                int len;
                while ((len = in.read(buf)) > 0) out.write(buf, 0, len);
            } finally {
                out.close();
                if (in != null) in.close();
            }
            return "Saved to Downloads: " + outName;
        } catch (Exception e) {
            return "Save failed: " + e.getMessage();
        } finally {
            if (tempFile != null) { try { tempFile.delete(); } catch (Exception ignored) { } }
        }
    }

    // ============================================================
    // SIGNATURE -- draw a signature, drag/pinch-resize it into place on the
    // current page, then stamp it into a new saved copy of the PDF (same
    // always-save-a-copy reasoning as Highlight: never risk the person's
    // original file, and a content:// source often can't be overwritten in
    // place anyway).
    // ============================================================

    // Signature ink (approved 2026-09-16): black, or a ballpoint-pen blue
    // that reads as hand-signed on paper. Black stays the first-time default.
    private static final int SIGNATURE_INK_BLACK = Color.BLACK;
    private static final int SIGNATURE_INK_BLUE = 0xFF1A47B8;
    private static final String PREF_SIGNATURE_INK_BLUE = "signature_ink_blue";
    // The drawn signature itself is remembered too (approved 2026-09-17), so
    // signing a second document is one tap instead of drawing again. Kept as
    // a PNG in the app's own private storage -- never in Documents, never
    // shared, and gone when DOCMAN is uninstalled.
    private static final String PREF_SIGNATURE_SAVE = "signature_save_enabled";
    private static final String SAVED_SIGNATURE_FILE = "signature/saved-signature.png";

    private java.io.File savedSignatureFile() {
        return new java.io.File(getFilesDir(), SAVED_SIGNATURE_FILE);
    }

    private Bitmap loadSavedSignature() {
        java.io.File f = savedSignatureFile();
        if (!f.exists()) return null;
        try {
            Bitmap bmp = android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath());
            if (bmp == null) f.delete(); // unreadable leftover -- don't keep offering it
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }

    private void storeSavedSignature(Bitmap bmp) {
        java.io.File f = savedSignatureFile();
        try {
            java.io.File dir = f.getParentFile();
            if (dir != null && !dir.exists() && !dir.mkdirs()) return;
            java.io.FileOutputStream out = new java.io.FileOutputStream(f);
            try {
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            } finally {
                out.close();
            }
        } catch (Exception e) {
            // Saving is a convenience -- the signature about to be placed is
            // unaffected, so this stays silent rather than interrupting.
            try { f.delete(); } catch (Exception ignored) { }
        }
    }

    private void deleteSavedSignature() {
        try { savedSignatureFile().delete(); } catch (Exception ignored) { }
    }

    // Entry point for the Sign tool: offer the saved signature when there is
    // one, otherwise go straight to drawing.
    private void showSignatureEntry() {
        final Bitmap saved = loadSavedSignature();
        if (saved == null) {
            showSignatureDrawDialog();
            return;
        }

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        container.setPadding(pad, 0, pad, pad);

        TextView sub = new TextView(this);
        sub.setText("Use your saved signature, or draw a new one.");
        sub.setTextColor(0xFF94A3B8);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        container.addView(sub);

        ImageView preview = new ImageView(this);
        preview.setImageBitmap(saved);
        preview.setAdjustViewBounds(true);
        preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.setPadding(dp(10), dp(10), dp(10), dp(10));
        android.graphics.drawable.GradientDrawable cardBg = new android.graphics.drawable.GradientDrawable();
        cardBg.setCornerRadius(dp(12));
        cardBg.setColor(Color.WHITE);
        preview.setBackground(cardBg);
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(120));
        previewParams.topMargin = dp(14);
        container.addView(preview, previewParams);

        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(16);
        container.addView(buttonRow, rowParams);

        TextView drawNewBtn = makePillButton("Draw new", false);
        TextView useBtn = makePillButton("Use this", true);
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        LinearLayout.LayoutParams halfRight = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        halfRight.leftMargin = dp(10);
        buttonRow.addView(drawNewBtn, half);
        buttonRow.addView(useBtn, halfRight);

        TextView deleteBtn = new TextView(this);
        deleteBtn.setText("Delete saved signature");
        deleteBtn.setTextColor(0xFFF87171);
        deleteBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        deleteBtn.setGravity(Gravity.CENTER);
        deleteBtn.setPadding(0, dp(14), 0, dp(4));
        deleteBtn.setClickable(true);
        container.addView(deleteBtn, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final AlertDialog dialog = new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Signature")
                .setView(container)
                .create();

        useBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                enterSignaturePlacementMode(saved);
            }
        });
        drawNewBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                showSignatureDrawDialog();
            }
        });
        deleteBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                deleteSavedSignature();
                dialog.dismiss();
                showNotice(NOTICE_OK, "Saved signature deleted", null);
            }
        });
        dialog.show();
    }

    // Filled (primary) or outlined pill button, matching the ink chips.
    private TextView makePillButton(String label, boolean filled) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextColor(filled ? Color.WHITE : 0xFFE8EAF0);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        btn.setTypeface(null, android.graphics.Typeface.BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(12), dp(11), dp(12), dp(11));
        btn.setClickable(true);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setCornerRadius(dp(24));
        bg.setColor(filled ? 0xFFFF6B4A : 0x00000000);
        if (!filled) bg.setStroke(dp(1), 0x47FFFFFF);
        btn.setBackground(bg);
        return btn;
    }

    private void showSignatureDrawDialog() {
        final SharedPreferences viewerPrefs = getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE);
        final boolean startBlue = viewerPrefs.getBoolean(PREF_SIGNATURE_INK_BLUE, false);

        final SignatureDrawView drawView = new SignatureDrawView(this, null);
        drawView.setBackgroundColor(Color.WHITE);
        drawView.setInkColor(startBlue ? SIGNATURE_INK_BLUE : SIGNATURE_INK_BLACK);
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        container.setPadding(pad, pad, pad, pad);
        container.addView(drawView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220)));

        LinearLayout inkRow = new LinearLayout(this);
        inkRow.setOrientation(LinearLayout.HORIZONTAL);
        inkRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams inkRowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        inkRowParams.topMargin = dp(14);
        container.addView(inkRow, inkRowParams);

        TextView inkLabel = new TextView(this);
        inkLabel.setText("Ink");
        inkLabel.setTextColor(0xFFCBD5E1);
        inkLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        inkRow.addView(inkLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        final LinearLayout blackChip = makeInkChip("Black", SIGNATURE_INK_BLACK);
        final LinearLayout blueChip = makeInkChip("Blue", SIGNATURE_INK_BLUE);
        inkRow.addView(blackChip);
        LinearLayout.LayoutParams blueChipParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blueChipParams.leftMargin = dp(8);
        inkRow.addView(blueChip, blueChipParams);
        styleInkChip(blackChip, !startBlue);
        styleInkChip(blueChip, startBlue);

        View.OnClickListener pickInk = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean useBlue = v == blueChip;
                styleInkChip(blackChip, !useBlue);
                styleInkChip(blueChip, useBlue);
                drawView.setInkColor(useBlue ? SIGNATURE_INK_BLUE : SIGNATURE_INK_BLACK);
            }
        };
        blackChip.setOnClickListener(pickInk);
        blueChip.setOnClickListener(pickInk);

        // "Save this signature for next time" -- on by default, and the
        // choice is remembered like the ink colour.
        LinearLayout saveRow = new LinearLayout(this);
        saveRow.setOrientation(LinearLayout.HORIZONTAL);
        saveRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams saveRowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        saveRowParams.topMargin = dp(10);
        container.addView(saveRow, saveRowParams);

        TextView saveLabel = new TextView(this);
        saveLabel.setText("Save this signature for next time");
        saveLabel.setTextColor(0xFFE8EAF0);
        saveLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        saveRow.addView(saveLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // SwitchCompat, not the framework Switch: it carries its own styling
        // rather than depending on what the dialog theme happens to define.
        final androidx.appcompat.widget.SwitchCompat saveSwitch = new androidx.appcompat.widget.SwitchCompat(this);
        int[][] switchStates = new int[][] { new int[] { android.R.attr.state_checked }, new int[] {} };
        saveSwitch.setThumbTintList(new android.content.res.ColorStateList(
                switchStates, new int[] { 0xFFFF6B4A, 0xFFB9BFCC }));
        saveSwitch.setTrackTintList(new android.content.res.ColorStateList(
                switchStates, new int[] { 0x66FF6B4A, 0x33FFFFFF }));
        saveSwitch.setChecked(viewerPrefs.getBoolean(PREF_SIGNATURE_SAVE, true));
        saveRow.addView(saveSwitch);

        final AlertDialog dialog = new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Draw Your Signature")
                .setView(container)
                .setPositiveButton("Done", null)
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Clear", null)
                .create();

        // Overriding the raw Button (rather than the listener passed to
        // setPositiveButton/setNeutralButton above) is deliberate: the
        // Builder's own listener path always dismisses the dialog on tap,
        // but Clear needs to keep it open, and Done needs to stay open too
        // when there's nothing drawn yet.
        dialog.setOnShowListener(new android.content.DialogInterface.OnShowListener() {
            @Override
            public void onShow(android.content.DialogInterface d) {
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        drawView.clear();
                    }
                });
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Bitmap bmp = drawView.exportSignatureBitmap();
                        if (bmp == null) {
                            // A card would sit behind this dialog, so the
                            // dialog's own title says it for two seconds.
                            dialog.setTitle("Draw a signature first");
                            mainHandler.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    if (dialog.isShowing()) dialog.setTitle("Draw Your Signature");
                                }
                            }, 2000);
                            return;
                        }
                        // Remembered only for a signature actually used, not
                        // for a colour tried and then cancelled.
                        viewerPrefs.edit()
                                .putBoolean(PREF_SIGNATURE_INK_BLUE, drawView.getInkColor() == SIGNATURE_INK_BLUE)
                                .putBoolean(PREF_SIGNATURE_SAVE, saveSwitch.isChecked())
                                .apply();
                        // Switch off means "don't keep this one" -- an older
                        // saved signature is replaced, never silently kept.
                        if (saveSwitch.isChecked()) storeSavedSignature(bmp);
                        else deleteSavedSignature();
                        dialog.dismiss();
                        enterSignaturePlacementMode(bmp);
                    }
                });
            }
        });
        dialog.show();
    }

    // A pill with a colour dot and a label, for the signature Ink row.
    private LinearLayout makeInkChip(String label, int inkColor) {
        LinearLayout chip = new LinearLayout(this);
        chip.setOrientation(LinearLayout.HORIZONTAL);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(dp(10), 0, dp(14), 0);
        chip.setMinimumHeight(dp(40));
        chip.setClickable(true);
        chip.setContentDescription(label + " ink");

        View dot = new View(this);
        android.graphics.drawable.GradientDrawable dotShape = new android.graphics.drawable.GradientDrawable();
        dotShape.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        dotShape.setColor(inkColor);
        dotShape.setStroke(dp(2), Color.WHITE);
        dot.setBackground(dotShape);
        chip.addView(dot, new LinearLayout.LayoutParams(dp(16), dp(16)));

        TextView text = new TextView(this);
        text.setText(label);
        text.setTextColor(0xFFF8FAFC);
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        textParams.leftMargin = dp(8);
        chip.addView(text, textParams);
        return chip;
    }

    // Selected: DOCMAN's orange outline on a faint orange fill, bold label.
    private void styleInkChip(LinearLayout chip, boolean selected) {
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setCornerRadius(dp(20));
        bg.setColor(selected ? 0x2EFF6B4A : 0x0FFFFFFF);
        bg.setStroke(selected ? dp(2) : dp(1), selected ? 0xFFFF6B4A : 0x40FFFFFF);
        chip.setBackground(bg);
        chip.setSelected(selected);
        TextView text = (TextView) chip.getChildAt(1);
        text.setTypeface(null, selected ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
    }

    private void enterSignaturePlacementMode(Bitmap bitmap) {
        // Same reasoning as Mark mode's own setSwipeEnabled(false): the
        // placement overlay owns every touch while active, which only works
        // cleanly if PDFView itself isn't also trying to interpret the same
        // drags as a page scroll/pinch-zoom.
        pdfView.setSwipeEnabled(false);
        signaturePlacementView.startPlacement(bitmap);
        signatureConfirmBar.setVisibility(View.VISIBLE);
        bottomToolStrip.setVisibility(View.GONE);
    }

    private void exitSignaturePlacementMode() {
        pdfView.setSwipeEnabled(true);
        signaturePlacementView.cancelPlacement();
        signatureConfirmBar.setVisibility(View.GONE);
        bottomToolStrip.setVisibility(View.VISIBLE);
    }

    private void stampSignatureAndSave() {
        final Bitmap bitmap = signaturePlacementView.getSignatureBitmap();
        final float[] placement = signaturePlacementView.getNormalizedPlacement();
        exitSignaturePlacementMode();
        if (bitmap == null || placement == null) {
            showNotice(NOTICE_ERROR, "Could not place the signature", null);
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        showNotice(NOTICE_BUSY, "Saving signed copy…", "Large PDFs can take a moment");

        final int page = (int) placement[0];
        final float fracLeft = placement[1], fracTop = placement[2], fracW = placement[3], fracH = placement[4];

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                PDDocument doc = null;
                String resultMessage;
                try {
                    doc = openPdDocumentForExtraction();
                    if (page < 0 || page >= doc.getNumberOfPages()) {
                        resultMessage = "Nothing to save";
                    } else {
                        PDPage pdPage = doc.getPage(page);
                        PDRectangle box = pdPage.getMediaBox();
                        int rotation = pdPage.getRotation();
                        boolean swapped = rotation == 90 || rotation == 270;
                        float pageWidthPts = swapped ? box.getHeight() : box.getWidth();
                        float pageHeightPts = swapped ? box.getWidth() : box.getHeight();

                        // fracTop/fracLeft/fracW/fracH are top-down fractions
                        // of the page's own on-screen box (see
                        // PdfSignaturePlacementView.getNormalizedPlacement());
                        // PDF content-stream coordinates are bottom-up, so
                        // flip through the page's own height, same as
                        // appendQuad() does for highlight QuadPoints.
                        float pdfX = fracLeft * pageWidthPts;
                        float pdfTopDownY = fracTop * pageHeightPts;
                        float pdfW = fracW * pageWidthPts;
                        float pdfH = fracH * pageHeightPts;
                        float pdfBottomUpY = pageHeightPts - pdfTopDownY - pdfH;

                        java.io.ByteArrayOutputStream pngOut = new java.io.ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, pngOut);

                        PDImageXObject image = PDImageXObject.createFromByteArray(doc, pngOut.toByteArray(), "signature");
                        PDPageContentStream cs = new PDPageContentStream(doc, pdPage,
                                PDPageContentStream.AppendMode.APPEND, true, true);
                        try {
                            cs.drawImage(image, pdfX, pdfBottomUpY, pdfW, pdfH);
                        } finally {
                            cs.close();
                        }

                        String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                        if (baseName.toLowerCase().endsWith(".pdf")) {
                            baseName = baseName.substring(0, baseName.length() - 4);
                        }
                        resultMessage = saveEditedCopy(doc, baseName + "_signed.pdf");
                        spendFreeTryIfSaved("sign", resultMessage);
                    }
                } catch (OutOfMemoryError e) {
                    // Same lesson as saveHighlightsToDownloadsThenFinish:
                    // OutOfMemoryError is a Throwable, not an Exception, and
                    // must be caught explicitly or it kills the whole app.
                    resultMessage = "Not enough memory to save this document (it's a large PDF)";
                } catch (Exception e) {
                    resultMessage = "Signature save failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        showSaveResult(msg);
                    }
                });
            }
        });
    }

    // ============================================================
    // FILL FORM -- a list of every fillable field in the document (text
    // fields and checkboxes; radio buttons/combo/list boxes aren't handled
    // yet -- rarer in practice and each needs its own option-picker UI) with
    // an input next to each, rather than tap-to-fill on the page itself. No
    // on-page overlay/positioning needed this way -- deliberately chosen
    // over the tap-to-fill approach given how much live device debugging
    // the gesture-heavy features (text selection, signature placement)
    // already needed this session. Saves a new copy, same reasoning as
    // Highlight/Signature.
    // ============================================================

    // One fillable field's identity plus the live input row showing/editing
    // it -- inputView is either an EditText (text field) or CheckBox.
    private static final class FormFieldRow {
        final String qualifiedName;
        final boolean isCheckbox;
        final View inputView;
        FormFieldRow(String qualifiedName, boolean isCheckbox, View inputView) {
            this.qualifiedName = qualifiedName;
            this.isCheckbox = isCheckbox;
            this.inputView = inputView;
        }
    }

    private void showFormFillDialog() {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                // {qualifiedName, isCheckbox, currentValue-or-null, checked}
                // packed as parallel lists rather than a throwaway POJO --
                // this background pass only needs to hand plain data back to
                // the main thread, which is what actually builds the input
                // rows (Views can't be touched off the main thread).
                final List<String> names = new ArrayList<>();
                final List<Boolean> isCheckboxList = new ArrayList<>();
                final List<String> currentValues = new ArrayList<>();
                final List<Boolean> currentChecked = new ArrayList<>();
                PDDocument doc = null;
                try {
                    doc = openPdDocumentForExtraction();
                    PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
                    if (form != null) {
                        for (PDField field : form.getFieldTree()) {
                            if (field.isReadOnly()) continue;
                            if (field instanceof PDTextField) {
                                names.add(field.getFullyQualifiedName());
                                isCheckboxList.add(false);
                                String v = ((PDTextField) field).getValue();
                                currentValues.add(v == null ? "" : v);
                                currentChecked.add(false);
                            } else if (field instanceof PDCheckBox) {
                                names.add(field.getFullyQualifiedName());
                                isCheckboxList.add(true);
                                currentValues.add("");
                                currentChecked.add(((PDCheckBox) field).isChecked());
                            }
                        }
                    }
                } catch (Exception e) {
                    // Leave whatever was collected before the failure --
                    // an empty/partial list just means fewer fields to fill
                    // rather than crashing the dialog.
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (names.isEmpty()) {
                            showNotice(NOTICE_INFO, "No fillable fields", "This PDF has no form to fill in");
                            return;
                        }
                        buildAndShowFormFillDialog(names, isCheckboxList, currentValues, currentChecked);
                    }
                });
            }
        });
    }

    private void buildAndShowFormFillDialog(List<String> names, List<Boolean> isCheckboxList,
            List<String> currentValues, List<Boolean> currentChecked) {
        LinearLayout rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        rows.setPadding(pad, dp(8), pad, dp(8));

        final List<FormFieldRow> fieldRows = new ArrayList<>();
        for (int i = 0; i < names.size(); i++) {
            String name = names.get(i);
            boolean isCheckbox = isCheckboxList.get(i);
            View inputView;
            if (isCheckbox) {
                CheckBox checkBox = new CheckBox(this);
                checkBox.setText(name);
                checkBox.setTextColor(COLOR_INACTIVE);
                checkBox.setChecked(currentChecked.get(i));
                rows.addView(checkBox);
                inputView = checkBox;
            } else {
                TextView label = new TextView(this);
                label.setText(name);
                label.setTextColor(COLOR_INACTIVE);
                label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                label.setPadding(0, dp(12), 0, dp(2));
                rows.addView(label);

                EditText input = new EditText(this);
                input.setInputType(InputType.TYPE_CLASS_TEXT);
                input.setText(currentValues.get(i));
                input.setTextColor(COLOR_INACTIVE);
                rows.addView(input);
                inputView = input;
            }
            fieldRows.add(new FormFieldRow(name, isCheckbox, inputView));
        }

        ScrollView scroll = new ScrollView(this);
        scroll.addView(rows);
        // Caps the dialog's height on a document with many fields -- a
        // ScrollView with no bound would otherwise try to grow to fit every
        // row and blow past the screen.
        scroll.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(400)));

        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Fill Form")
                .setView(scroll)
                .setPositiveButton("Save", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        saveFormFieldsAndSave(fieldRows);
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void saveFormFieldsAndSave(final List<FormFieldRow> fieldRows) {
        // Read the live input values on the main thread (Views aren't safe
        // to touch from the background executor) into plain data, then hand
        // that off for the actual PDF write.
        final List<String> names = new ArrayList<>();
        final List<Boolean> isCheckboxList = new ArrayList<>();
        final List<String> values = new ArrayList<>();
        final List<Boolean> checkedList = new ArrayList<>();
        for (FormFieldRow row : fieldRows) {
            names.add(row.qualifiedName);
            isCheckboxList.add(row.isCheckbox);
            if (row.isCheckbox) {
                checkedList.add(((CheckBox) row.inputView).isChecked());
                values.add("");
            } else {
                checkedList.add(false);
                values.add(((EditText) row.inputView).getText().toString());
            }
        }

        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        showNotice(NOTICE_BUSY, "Saving filled copy…", "Large PDFs can take a moment");

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                PDDocument doc = null;
                String resultMessage;
                try {
                    doc = openPdDocumentForExtraction();
                    PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
                    if (form == null) {
                        resultMessage = "Nothing to save";
                    } else {
                        for (int i = 0; i < names.size(); i++) {
                            PDField field = form.getField(names.get(i));
                            if (field == null) continue;
                            if (isCheckboxList.get(i) && field instanceof PDCheckBox) {
                                if (checkedList.get(i)) {
                                    ((PDCheckBox) field).check();
                                } else {
                                    ((PDCheckBox) field).unCheck();
                                }
                            } else if (!isCheckboxList.get(i)) {
                                field.setValue(values.get(i));
                            }
                        }
                        String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                        if (baseName.toLowerCase().endsWith(".pdf")) {
                            baseName = baseName.substring(0, baseName.length() - 4);
                        }
                        resultMessage = saveEditedCopy(doc, baseName + "_filled.pdf");
                        spendFreeTryIfSaved("fillform", resultMessage);
                    }
                } catch (OutOfMemoryError e) {
                    resultMessage = "Not enough memory to save this document (it's a large PDF)";
                } catch (Exception e) {
                    resultMessage = "Form save failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        showSaveResult(msg);
                    }
                });
            }
        });
    }

    // ============================================================
    // ERASE -- a brush, like Google's scanner Clean tool, except that what
    // is painted over stays gone. One finger paints on any page, two
    // fingers move and zoom (see PdfRedactOverlayView), then ONE copy is
    // saved. Each stroke is filled with the paper colour sampled right
    // around it, or black, and every affected page is flattened to an image
    // with the strokes painted in, so whatever was underneath -- printed
    // text, see-through lines, stains, pen marks -- is really removed from
    // the saved copy, not just covered. The open file is never changed.
    // Pages rotated inside the PDF are skipped: the screen-to-page mapping
    // assumes an unrotated page, and a misplaced erase is worse than none.
    // ============================================================
    private static final String ERASE_PREFS = "docman_erase";
    private boolean eraseModeActive = false;
    private FrameLayout eraseChrome;
    private View eraseTopBar, eraseSheet;
    private TextView eraseSubtitle, eraseSaveBtn, erasePaperBtn, eraseBlackBtn;
    private ImageView eraseUndoBtn, eraseRedoBtn;
    private FrameLayout.LayoutParams eraseSavedContainerLp;
    private int eraseSavedSecondaryVisibility = View.GONE;
    private final Runnable hideBrushPreview = new Runnable() {
        @Override
        public void run() {
            if (redactOverlay != null) redactOverlay.setSizePreviewVisible(false);
        }
    };

    private float brushPxFor(float value) {
        float min = dp(6), max = dp(64);
        return min + Math.max(0f, Math.min(1f, value)) * (max - min);
    }

    private void enterEraseMode() {
        if (eraseModeActive) return;
        eraseModeActive = true;
        float brushValue = getSharedPreferences(ERASE_PREFS, MODE_PRIVATE).getFloat("brush", 0.35f);
        redactOverlay.clearAll();
        redactOverlay.setColorMode(PdfRedactOverlayView.MODE_PAPER);
        redactOverlay.setNightMode(nightModeEnabled);
        redactOverlay.setBrushSizePx(brushPxFor(brushValue));
        redactOverlay.setActive(true);
        // Only two-finger gestures reach the page while erasing.
        pdfView.setSwipeEnabled(true);
        if (toolbar != null) toolbar.setVisibility(View.GONE);
        bottomToolStrip.setVisibility(View.GONE);
        applyChromeInsets();
        View secondary = findViewById(R.id.pdfSecondaryBar);
        if (secondary != null) {
            eraseSavedSecondaryVisibility = secondary.getVisibility();
            secondary.setVisibility(View.GONE);
        }
        buildEraseChrome(brushValue);
        updateEraseState();
        redactOverlay.prepareSample(pdfView.getCurrentPage());
    }

    private void exitEraseMode() {
        if (!eraseModeActive) return;
        eraseModeActive = false;
        mainHandler.removeCallbacks(hideBrushPreview);
        redactOverlay.setActive(false);
        redactOverlay.clearAll();
        pdfView.setSwipeEnabled(true);
        if (eraseSavedContainerLp != null) {
            pdfContainer.setLayoutParams(eraseSavedContainerLp);
            eraseSavedContainerLp = null;
        }
        if (eraseChrome != null) {
            ViewGroup parent = (ViewGroup) eraseChrome.getParent();
            if (parent != null) parent.removeView(eraseChrome);
            eraseChrome = null;
        }
        eraseTopBar = null;
        eraseSheet = null;
        if (!isFullScreen) {
            if (toolbar != null) toolbar.setVisibility(View.VISIBLE);
            bottomToolStrip.setVisibility(View.VISIBLE);
            if (pdfContainer != null) pdfContainer.post(new Runnable() {
                @Override
                public void run() { applyChromeInsets(); }
            });
        }
        View secondary = findViewById(R.id.pdfSecondaryBar);
        // page counter stays hidden -- see the layout comment
    }

    // Back and the X both come here: painted work is never thrown away silently.
    private void cancelEraseMode() {
        if (redactOverlay.getStrokeCount() == 0) { exitEraseMode(); return; }
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Discard your erasing?")
                .setMessage("Nothing has been saved yet.")
                .setPositiveButton("Discard", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) { exitEraseMode(); }
                })
                .setNegativeButton("Keep editing", null)
                .show();
    }

    private void setEraseColor(int mode) {
        redactOverlay.setColorMode(mode);
        updateEraseState();
    }

    private void updateEraseState() {
        if (eraseChrome == null) return;
        int strokes = redactOverlay.getStrokeCount();
        int pages = redactOverlay.getEditedPageCount();
        eraseSubtitle.setText(strokes == 0 ? "Paint over anything to remove it"
                : (pages == 1 ? "Erased on 1 page" : "Erased on " + pages + " pages"));
        eraseSaveBtn.setAlpha(strokes == 0 ? 0.42f : 1f);
        eraseUndoBtn.setAlpha(redactOverlay.canUndo() ? 1f : 0.38f);
        eraseRedoBtn.setAlpha(redactOverlay.canRedo() ? 1f : 0.38f);

        boolean black = redactOverlay.getColorMode() == PdfRedactOverlayView.MODE_BLACK;
        int segOn = Color.parseColor("#FF9442"), segOnText = Color.parseColor("#241000"), segOffText = Color.parseColor("#C9C9D6");
        erasePaperBtn.setBackground(!black ? pill(segOn, 0, 20) : null);
        erasePaperBtn.setTextColor(!black ? segOnText : segOffText);
        eraseBlackBtn.setBackground(black ? pill(segOn, 0, 20) : null);
        eraseBlackBtn.setTextColor(black ? segOnText : segOffText);
    }

    // A small render of one page, only for picking paper colours on screen.
    private void renderEraseSample(final int page) {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) {
            redactOverlay.setPageSample(page, null);
            return;
        }
        com.shockwave.pdfium.util.SizeF size = pdfView.getPageSize(page);
        final int w = 720;
        final int h = (size == null || size.getWidth() <= 0) ? 1018
                : Math.max(1, Math.min(2880, Math.round(w * size.getHeight() / size.getWidth())));
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final Bitmap bmp = renderPageBitmapForFlatten(page, w, h);
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        redactOverlay.setPageSample(page, bmp);
                    }
                });
            }
        });
    }

    // Shrinks the page area to the space between the top bar and the tool
    // panel, so the top and bottom of every page can still be reached.
    private void applyEraseContainerBounds() {
        if (!eraseModeActive || eraseTopBar == null || eraseSheet == null) return;
        if (rotationDegrees != 0) return; // the rotated container keeps its own size
        View parent = (View) pdfContainer.getParent();
        if (parent == null || eraseSheet.getHeight() == 0) return;
        int[] p = new int[2], bar = new int[2], sheet = new int[2];
        parent.getLocationOnScreen(p);
        eraseTopBar.getLocationOnScreen(bar);
        eraseSheet.getLocationOnScreen(sheet);
        int top = Math.max(0, bar[1] + eraseTopBar.getHeight() - p[1]);
        int bottom = Math.max(0, p[1] + parent.getHeight() - sheet[1]);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) pdfContainer.getLayoutParams();
        if (eraseSavedContainerLp == null) {
            eraseSavedContainerLp = new FrameLayout.LayoutParams(lp);
        } else if (lp.topMargin == top && lp.bottomMargin == bottom) {
            return;
        }
        FrameLayout.LayoutParams fitted = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.TOP);
        fitted.topMargin = top;
        fitted.bottomMargin = bottom;
        pdfContainer.setLayoutParams(fitted);
    }

    private android.graphics.drawable.GradientDrawable pill(int fill, int stroke, int radiusDp) {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setColor(fill);
        if (stroke != 0) d.setStroke(dp(1), stroke);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private TextView eraseChip(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), dp(8), dp(14), dp(8));
        t.setClickable(true);
        t.setFocusable(true);
        return t;
    }

    private void eraseSwatch(TextView chip, int fill, int stroke) {
        android.graphics.drawable.GradientDrawable sw = new android.graphics.drawable.GradientDrawable();
        sw.setColor(fill);
        sw.setStroke(Math.max(1, dp(1)), stroke);
        sw.setCornerRadius(dp(3));
        sw.setSize(dp(12), dp(12));
        chip.setCompoundDrawablesWithIntrinsicBounds(sw, null, null, null);
        chip.setCompoundDrawablePadding(dp(7));
    }

    private ImageView eraseRoundButton(int iconRes, String label) {
        ImageView b = new ImageView(this);
        b.setImageResource(iconRes);
        b.setColorFilter(Color.parseColor("#E6E6EF"));
        b.setScaleType(ImageView.ScaleType.FIT_CENTER);
        b.setPadding(dp(10), dp(10), dp(10), dp(10));
        b.setBackground(pill(Color.parseColor("#23254A"), 0, 20));
        b.setContentDescription(label);
        b.setClickable(true);
        b.setFocusable(true);
        return b;
    }

    private View eraseDot(int sizeDp) {
        View dot = new View(this);
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        d.setColor(Color.parseColor("#8B8BA6"));
        dot.setBackground(d);
        dot.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return dot;
    }

    private void buildEraseChrome(float brushValue) {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;
        if (eraseChrome != null) content.removeView(eraseChrome);

        int topInset = 0, bottomInset = 0;
        if (content.getRootWindowInsets() != null) {
            topInset = content.getRootWindowInsets().getSystemWindowInsetTop();
            bottomInset = content.getRootWindowInsets().getSystemWindowInsetBottom();
        }

        FrameLayout root = new FrameLayout(this);

        // Top bar: X · Erase / status · Save
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#14142B"));
        bar.setPadding(dp(4), topInset + dp(6), dp(12), dp(8));
        bar.setClickable(true); // taps on the bar never reach the page

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextColor(Color.parseColor("#D7D7E0"));
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        close.setGravity(Gravity.CENTER);
        close.setClickable(true);
        close.setContentDescription("Cancel erasing");
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { cancelEraseMode(); }
        });
        bar.addView(close, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("Erase");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        mid.addView(title);
        eraseSubtitle = new TextView(this);
        eraseSubtitle.setTextColor(Color.parseColor("#A8A3C7"));
        eraseSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        mid.addView(eraseSubtitle);
        bar.addView(mid, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        eraseSaveBtn = eraseChip("✓  Save");
        eraseSaveBtn.setTextColor(Color.WHITE);
        eraseSaveBtn.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        eraseSaveBtn.setBackground(pill(Color.parseColor("#22C55E"), 0, 18));
        eraseSaveBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saveErasedCopy(); }
        });
        bar.addView(eraseSaveBtn);

        root.addView(bar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // Bottom: a short hint above the tool panel.
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);

        final TextView hint = new TextView(this);
        hint.setText("One finger paints · two fingers move and zoom");
        hint.setTextColor(Color.parseColor("#E2DCEA"));
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(12), dp(7), dp(12), dp(7));
        hint.setBackground(pill(Color.parseColor("#C70A0A14"), 0, 10));
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintLp.setMargins(dp(14), 0, dp(14), dp(10));
        bottom.addView(hint, hintLp);

        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        android.graphics.drawable.GradientDrawable sheetBg = new android.graphics.drawable.GradientDrawable();
        sheetBg.setColor(Color.parseColor("#14142B"));
        float corner = dp(22);
        sheetBg.setCornerRadii(new float[]{corner, corner, corner, corner, 0, 0, 0, 0});
        sheet.setBackground(sheetBg);
        sheet.setPadding(dp(16), dp(14), dp(16), bottomInset + dp(12));
        sheet.setClickable(true);
        sheet.setElevation(dp(10));

        // Row 1: Paper colour / Black · Undo · Redo
        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout seg = new LinearLayout(this);
        seg.setOrientation(LinearLayout.HORIZONTAL);
        seg.setPadding(dp(3), dp(3), dp(3), dp(3));
        seg.setBackground(pill(Color.parseColor("#23254A"), 0, 22));
        erasePaperBtn = eraseChip("Paper colour");
        eraseSwatch(erasePaperBtn, Color.parseColor("#F5F3EC"), Color.parseColor("#4D000000"));
        eraseBlackBtn = eraseChip("Black");
        eraseSwatch(eraseBlackBtn, Color.parseColor("#111111"), Color.parseColor("#59FFFFFF"));
        erasePaperBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { setEraseColor(PdfRedactOverlayView.MODE_PAPER); }
        });
        eraseBlackBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { setEraseColor(PdfRedactOverlayView.MODE_BLACK); }
        });
        seg.addView(erasePaperBtn);
        seg.addView(eraseBlackBtn);
        row1.addView(seg, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        row1.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        eraseUndoBtn = eraseRoundButton(R.drawable.ic_erase_undo, "Undo");
        eraseRedoBtn = eraseRoundButton(R.drawable.ic_erase_redo, "Redo");
        eraseUndoBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { redactOverlay.undo(); }
        });
        eraseRedoBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { redactOverlay.redo(); }
        });
        row1.addView(eraseUndoBtn, new LinearLayout.LayoutParams(dp(40), dp(40)));
        LinearLayout.LayoutParams redoLp = new LinearLayout.LayoutParams(dp(40), dp(40));
        redoLp.leftMargin = dp(8);
        row1.addView(eraseRedoBtn, redoLp);
        sheet.addView(row1, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Row 2: Brush size
        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER_VERTICAL);
        TextView label = new TextView(this);
        label.setText("Brush");
        label.setTextColor(Color.parseColor("#A8A3C7"));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        row2.addView(label, new LinearLayout.LayoutParams(dp(46), ViewGroup.LayoutParams.WRAP_CONTENT));
        row2.addView(eraseDot(6));
        EraseBrushSliderView slider = new EraseBrushSliderView(this);
        slider.setValue(brushValue);
        slider.setOnValueChangeListener(new EraseBrushSliderView.OnValueChangeListener() {
            @Override
            public void onValueChanged(float value, boolean dragging) {
                redactOverlay.setBrushSizePx(brushPxFor(value));
                mainHandler.removeCallbacks(hideBrushPreview);
                if (dragging) {
                    redactOverlay.setSizePreviewVisible(true);
                } else {
                    getSharedPreferences(ERASE_PREFS, MODE_PRIVATE).edit().putFloat("brush", value).apply();
                    mainHandler.postDelayed(hideBrushPreview, 700);
                }
            }
        });
        LinearLayout.LayoutParams sliderLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        row2.addView(slider, sliderLp);
        row2.addView(eraseDot(16));
        LinearLayout.LayoutParams row2Lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        row2Lp.topMargin = dp(8);
        sheet.addView(row2, row2Lp);

        bottom.addView(sheet, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(bottom, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        // Views that don't consume touches (this layer's empty space, the
        // hint) let them through to the page underneath.
        content.addView(root, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        eraseChrome = root;
        eraseTopBar = bar;
        eraseSheet = sheet;

        View.OnLayoutChangeListener fit = new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int left, int top, int right, int bottomEdge,
                                       int oldLeft, int oldTop, int oldRight, int oldBottom) {
                applyEraseContainerBounds();
            }
        };
        bar.addOnLayoutChangeListener(fit);
        sheet.addOnLayoutChangeListener(fit);

        mainHandler.postDelayed(new Runnable() {
            @Override public void run() { hint.animate().alpha(0f).setDuration(300).start(); }
        }, 5000);
    }

    private void saveErasedCopy() {
        final List<PdfRedactOverlayView.Stroke> strokes = redactOverlay.getStrokesForSave();
        if (strokes.isEmpty()) {
            showNotice(NOTICE_ERROR, "Nothing erased yet", "Paint over what you want to remove");
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        boolean anyPaper = false;
        for (PdfRedactOverlayView.Stroke s : strokes) if (s.mode == PdfRedactOverlayView.MODE_PAPER) anyPaper = true;
        final String suffix = anyPaper ? "_erased.pdf" : "_redacted.pdf";

        exitEraseMode();
        showNotice(NOTICE_BUSY, "Erasing and saving copy…", "Large PDFs can take a moment");

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                PDDocument doc = null;
                String resultMessage;
                int skipped = 0, done = 0;
                try {
                    doc = openPdDocumentForExtraction();
                    java.util.TreeMap<Integer, List<PdfRedactOverlayView.Stroke>> byPage = new java.util.TreeMap<>();
                    for (PdfRedactOverlayView.Stroke s : strokes) {
                        if (s.page < 0 || s.page >= doc.getNumberOfPages()) continue;
                        List<PdfRedactOverlayView.Stroke> list = byPage.get(s.page);
                        if (list == null) { list = new ArrayList<>(); byPage.put(s.page, list); }
                        list.add(s);
                    }
                    for (Map.Entry<Integer, List<PdfRedactOverlayView.Stroke>> e : byPage.entrySet()) {
                        int page = e.getKey();
                        PDPage pdPage = doc.getPage(page);
                        if (pdPage.getRotation() != 0) { skipped += e.getValue().size(); continue; }
                        PDRectangle box = pdPage.getMediaBox();
                        float pageWidthPts = box.getWidth();
                        float pageHeightPts = box.getHeight();
                        // 2 pixels per PDF point, same as the old Redact.
                        int outW = Math.max(1, Math.round(pageWidthPts * 2f));
                        int outH = Math.max(1, Math.round(pageHeightPts * 2f));
                        Bitmap flattened = renderPageBitmapForFlatten(page, outW, outH);
                        if (flattened == null) throw new IllegalStateException("could not render page " + (page + 1));
                        try {
                            // Colours the screen never got (its page sample hadn't
                            // arrived) come from this render, before anything is painted.
                            for (PdfRedactOverlayView.Stroke s : e.getValue()) {
                                if (s.mode == PdfRedactOverlayView.MODE_PAPER && s.colours == null) {
                                    s.colours = PdfRedactOverlayView.sampleColours(s, flattened);
                                }
                            }
                            Canvas canvas = new Canvas(flattened);
                            Paint brush = new Paint(Paint.ANTI_ALIAS_FLAG);
                            brush.setStyle(Paint.Style.STROKE);
                            brush.setStrokeCap(Paint.Cap.ROUND);
                            brush.setStrokeJoin(Paint.Join.ROUND);
                            for (PdfRedactOverlayView.Stroke s : e.getValue()) {
                                canvas.save();
                                canvas.scale(outW / PdfRedactOverlayView.UNITS,
                                        outH / (PdfRedactOverlayView.UNITS * s.aspect));
                                brush.setStrokeWidth(s.width);
                                for (int c = 0; c < s.paths.length; c++) {
                                    brush.setColor(s.mode == PdfRedactOverlayView.MODE_BLACK ? Color.BLACK : s.colours[c]);
                                    canvas.drawPath(s.paths[c], brush);
                                }
                                canvas.restore();
                                done++;
                            }
                            java.io.ByteArrayOutputStream pngOut = new java.io.ByteArrayOutputStream();
                            flattened.compress(Bitmap.CompressFormat.PNG, 100, pngOut);
                            PDImageXObject image = PDImageXObject.createFromByteArray(doc, pngOut.toByteArray(), "erased-page");
                            // OVERWRITE: the page's old content stream is discarded,
                            // so nothing under an erased area survives.
                            PDPageContentStream cs = new PDPageContentStream(doc, pdPage,
                                    PDPageContentStream.AppendMode.OVERWRITE, true, true);
                            try {
                                cs.drawImage(image, box.getLowerLeftX(), box.getLowerLeftY(), pageWidthPts, pageHeightPts);
                            } finally {
                                cs.close();
                            }
                        } finally {
                            flattened.recycle();
                        }
                    }
                    if (done == 0) {
                        resultMessage = skipped > 0
                                ? "Save failed: erasing isn't supported on rotated pages yet"
                                : "Save failed: nothing to erase";
                    } else {
                        String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                        if (baseName.toLowerCase().endsWith(".pdf")) baseName = baseName.substring(0, baseName.length() - 4);
                        resultMessage = saveEditedCopy(doc, baseName + suffix);
                        spendFreeTryIfSaved("redact", resultMessage);
                    }
                } catch (OutOfMemoryError e) {
                    resultMessage = "Save failed: not enough memory to erase these pages (large PDF)";
                } catch (Exception e) {
                    resultMessage = "Save failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                final int skippedStrokes = skipped;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        final String inFolder = "Saved in this folder as ";
                        if (skippedStrokes > 0 && msg.startsWith(inFolder)) {
                            showNotice(NOTICE_OK, "Saved in this folder",
                                    msg.substring(inFolder.length()) + " · rotated pages skipped");
                        } else {
                            showSaveResult(msg);
                        }
                    }
                });
            }
        });
    }

    // ============================================================
    // CROP PAGE -- unlike Redact (which flattens the page to a raster
    // image because it must genuinely remove content), a crop only needs
    // to shrink the page's own MediaBox/CropBox to the marked area. The
    // content stream is untouched -- anything outside the new box simply
    // falls outside the page's visible/printable extent, exactly what
    // Acrobat's own "Crop Pages" tool does. Much cheaper than redaction:
    // no bitmap render, no PNG re-encode, near-instant.
    // ============================================================
    private void enterCropMode() {
        pdfView.setSwipeEnabled(false);
        cropOverlay.setModeEnabled(true);
        bottomToolStrip.setVisibility(View.GONE);
        showNotice(NOTICE_INFO, "Crop page", "Drag to mark the area to keep on this page");
    }

    private void confirmAndCrop() {
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Crop this page?")
                .setMessage("Everything outside the marked area on this page will be trimmed away in a new saved copy. The original file is never changed.")
                .setPositiveButton("Crop", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        cropSelectedAreaAndSave();
                    }
                })
                .setNegativeButton("Cancel", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        cropOverlay.clearConfirmedRect();
                    }
                })
                .show();
    }

    private void cropSelectedAreaAndSave() {
        final float[] area = cropOverlay.getNormalizedCropArea();
        cropOverlay.clearConfirmedRect();
        if (area == null) {
            showNotice(NOTICE_ERROR, "Could not mark that area", null);
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        showNotice(NOTICE_BUSY, "Cropping and saving copy…", "Large PDFs can take a moment");

        final int page = (int) area[0];
        final float fracLeft = area[1], fracTop = area[2], fracW = area[3], fracH = area[4];

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                PDDocument doc = null;
                String resultMessage;
                try {
                    doc = openPdDocumentForExtraction();
                    if (page < 0 || page >= doc.getNumberOfPages()) {
                        resultMessage = "Nothing to crop";
                    } else {
                        PDPage pdPage = doc.getPage(page);
                        int rotation = pdPage.getRotation();
                        if (rotation != 0) {
                            resultMessage = "This page is rotated -- crop isn't supported on rotated pages yet";
                        } else {
                            PDRectangle box = pdPage.getMediaBox();
                            float pageWidthPts = box.getWidth();
                            float pageHeightPts = box.getHeight();

                            // fracTop/fracH are top-down screen fractions (see
                            // PdfCropOverlayView.getNormalizedCropArea); PDF
                            // rectangles are bottom-up, so the crop box's own
                            // lower-left Y is the page's bottom plus whatever
                            // is BELOW the marked area on screen -- same flip
                            // buildHighlightQuadPoints/appendQuad already does
                            // for highlight placement.
                            float cropX = box.getLowerLeftX() + fracLeft * pageWidthPts;
                            float cropWidth = fracW * pageWidthPts;
                            float cropY = box.getLowerLeftY() + pageHeightPts * (1f - fracTop - fracH);
                            float cropHeight = fracH * pageHeightPts;

                            if (cropWidth <= 0 || cropHeight <= 0) {
                                resultMessage = "Could not mark that area";
                            } else {
                                PDRectangle newBox = new PDRectangle(cropX, cropY, cropWidth, cropHeight);
                                pdPage.setMediaBox(newBox);
                                pdPage.setCropBox(newBox);

                                String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                                if (baseName.toLowerCase().endsWith(".pdf")) {
                                    baseName = baseName.substring(0, baseName.length() - 4);
                                }
                                resultMessage = saveEditedCopy(doc, baseName + "_cropped.pdf");
                                spendFreeTryIfSaved("crop", resultMessage);
                            }
                        }
                    }
                } catch (OutOfMemoryError e) {
                    resultMessage = "Not enough memory to crop this page";
                } catch (Exception e) {
                    resultMessage = "Crop failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        showSaveResult(msg);
                    }
                });
            }
        });
    }

    // Same pdfium single-page-render technique as renderSinglePageThumbnail
    // below (its own comment explains why: a second, independent, short-
    // lived PdfiumCore document rather than touching pdfView's own), just at
    // full ARGB_8888 (this is a one-off flatten, not hundreds of thumbnails,
    // so the extra memory per pixel doesn't matter here) and an explicit
    // output size instead of a single target dimension.
    // One open document for every page rendered this visit. Opening it per page
    // meant parsing a 2000-page file again for each page of a drawing sweep --
    // by far the largest part of the wait, dwarfing the actual rendering.
    private PdfiumCore renderCore;
    private PdfDocument renderDoc;
    private ParcelFileDescriptor renderPfd;
    private final Object renderLock = new Object();

    private Bitmap renderPageBitmapForFlatten(int pageIndex, int outW, int outH) {
        try {
            synchronized (renderLock) {
                if (renderDoc == null) {
                    renderCore = new PdfiumCore(this);
                    if (pdfPath.startsWith("content://")) {
                        renderPfd = getContentResolver().openFileDescriptor(Uri.parse(pdfPath), "r");
                    } else if (pdfPath.startsWith("file://")) {
                        renderPfd = ParcelFileDescriptor.open(new File(Uri.parse(pdfPath).getPath()),
                                ParcelFileDescriptor.MODE_READ_ONLY);
                    } else {
                        renderPfd = ParcelFileDescriptor.open(new File(pdfPath),
                                ParcelFileDescriptor.MODE_READ_ONLY);
                    }
                    if (renderPfd == null) return null;
                    renderDoc = renderCore.newDocument(renderPfd);
                }
                renderCore.openPage(renderDoc, pageIndex);
                Bitmap bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
                renderCore.renderPageBitmap(renderDoc, bitmap, pageIndex, 0, 0, outW, outH);
                return bitmap;
            }
        } catch (OutOfMemoryError e) {
            // A huge/dense page's full-resolution bitmap can exceed the heap --
            // graceful null return rather than an uncaught crash on a worker.
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private void closeRenderDocument() {
        synchronized (renderLock) {
            try { if (renderDoc != null && renderCore != null) renderCore.closeDocument(renderDoc); } catch (Exception ignored) { }
            try { if (renderPfd != null) renderPfd.close(); } catch (Exception ignored) { }
            renderDoc = null;
            renderPfd = null;
            renderCore = null;
        }
    }

    // ============================================================
    // OCR FALLBACK -- for a scanned/image-only page (PDFTextStripper found
    // no text objects at all), runs Google ML Kit's on-device Latin-script
    // text recognizer against a rendered bitmap of the page instead, so
    // selection/highlight still works on this class of document rather
    // than silently doing nothing. Fully on-device: no network call, no
    // API key, no google-services.json -- just needs Google Play Services
    // on the device, same as virtually every real Android phone.
    //
    // Word-level granularity (ML Kit's "Element"), not character-level like
    // real PDF text -- see CharBox.wholeUnit's own comment for how the
    // selection code adapts to that. Coordinates convert cleanly: the
    // rendered bitmap's pixel space is already top-left-origin/y-down, the
    // exact same convention CharBox already uses for real PDF text, so
    // there's no rotation-flip math needed here the way there is for
    // Highlight/Signature/Redact's PDF-content-stream coordinates.
    // ============================================================
    // ML Kit's recognizer is expensive to construct and perfectly reusable, so
// building one per page was pure overhead on a sweep of two thousand pages.
    private com.google.mlkit.vision.text.TextRecognizer sharedRecognizer;

    private synchronized com.google.mlkit.vision.text.TextRecognizer recognizer() {
        if (sharedRecognizer == null) {
            sharedRecognizer = com.google.mlkit.vision.text.TextRecognition.getClient(
                    com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS);
        }
        return sharedRecognizer;
    }

    private void runOcrFallback(PageTextLayout layout, int pageIndex) {
        runOcrFallback(layout, pageIndex, 2.5f);
    }

    // renderScale: ~2.5px per PDF point is roughly 180 DPI, the quality used
    // when reading ONE page on demand. A whole-document drawing sweep uses
    // less: pixel count grows with the square of the scale, and CAD tags are
    // crisp vector text that survives the lower resolution.
    private void runOcrFallback(PageTextLayout layout, int pageIndex, float renderScale) {
        if (layout.pageWidthPts <= 0 || layout.pageHeightPts <= 0) return;
        int outW = Math.max(1, Math.round(layout.pageWidthPts * renderScale));
        int outH = Math.max(1, Math.round(layout.pageHeightPts * renderScale));
        Bitmap bitmap = renderPageBitmapForFlatten(pageIndex, outW, outH);
        if (bitmap == null) return;
        try {
            com.google.mlkit.vision.text.TextRecognizer recognizer = recognizer();
            com.google.mlkit.vision.common.InputImage image =
                    com.google.mlkit.vision.common.InputImage.fromBitmap(bitmap, 0);
            // Blocking wait is safe here -- this whole method already runs
            // on thumbnailExecutor's background thread, never the main one
            // (Tasks.await() throws if called from the main looper).
            com.google.mlkit.vision.text.Text result =
                    com.google.android.gms.tasks.Tasks.await(recognizer.process(image));
            for (com.google.mlkit.vision.text.Text.TextBlock block : result.getTextBlocks()) {
                for (com.google.mlkit.vision.text.Text.Line line : block.getLines()) {
                    for (com.google.mlkit.vision.text.Text.Element element : line.getElements()) {
                        android.graphics.Rect box = element.getBoundingBox();
                        if (box == null) continue;
                        layout.chars.add(new CharBox(
                                element.getText() + " ",
                                box.left / renderScale,
                                box.top / renderScale,
                                box.width() / renderScale,
                                box.height() / renderScale,
                                true));
                    }
                }
            }
        } catch (OutOfMemoryError e) {
            // Rendering/OCR-ing a huge page can exceed the heap the same
            // way saving a large document can (see the save methods'
            // own OutOfMemoryError catches) -- caught here as a Throwable,
            // not an Exception, since this runs on the background executor
            // thread with nothing else above it to catch it.
        } catch (Exception e) {
            // Leave layout empty -- OCR failing just means no selection on
            // this one page rather than crashing.
        } finally {
            bitmap.recycle();
        }
    }

    // Plain-text sibling of runOcrFallback() above, for Search/Copy Page
    // Text -- those only need the recognized string, not per-word
    // bounding boxes, so this skips straight to Text.getText() instead of
    // building a PageTextLayout. Same on-device ML Kit recognizer, same
    // render scale/cost tradeoff.
    private String ocrPageTextFallback(int pageIndex, float pageWidthPts, float pageHeightPts) {
        if (pageWidthPts <= 0 || pageHeightPts <= 0) return "";
        final float renderScale = 2.5f;
        int outW = Math.max(1, Math.round(pageWidthPts * renderScale));
        int outH = Math.max(1, Math.round(pageHeightPts * renderScale));
        Bitmap bitmap = renderPageBitmapForFlatten(pageIndex, outW, outH);
        if (bitmap == null) return "";
        try {
            com.google.mlkit.vision.text.TextRecognizer recognizer = recognizer();
            com.google.mlkit.vision.common.InputImage image =
                    com.google.mlkit.vision.common.InputImage.fromBitmap(bitmap, 0);
            com.google.mlkit.vision.text.Text result =
                    com.google.android.gms.tasks.Tasks.await(recognizer.process(image));
            String text = result.getText();
            return text == null ? "" : text;
        } catch (OutOfMemoryError e) {
            return "";
        } catch (Exception e) {
            return "";
        } finally {
            bitmap.recycle();
        }
    }

    // ---- search progress ticker ------------------------------------------
    // Keeps the search label moving while the work happens off the UI thread:
    // "Opening document" with travelling dots until the page count is known,
    // then "Reading page N of M" plus a percentage.
    private int searchScanDone = 0;
    private int searchScanTotal = 0;
    private boolean searchTicking = false;
    private volatile boolean extractionCancelled = false;
    private long searchStartedAt = 0L;
    private volatile boolean lastWorkerFailureWasOom = false;

    // Pre-built so reporting a background failure needs no allocation -- see
    // the worker thread's uncaught-exception handler.
    private final Runnable workerFailureReporter = new Runnable() {
        @Override
        public void run() {
            stopSearchTicker();
            setSearchStepEnabled(false);
            if (searchLabel != null && searchBar != null && searchBar.getVisibility() == View.VISIBLE) {
                searchLabel.setTextColor(Color.parseColor("#F8A5B4"));
                searchLabel.setText(lastWorkerFailureWasOom
                        ? "File too large to search" : "Couldn't read this file");
            }
        }
    };

    private final Runnable searchTickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!searchTicking || searchLabel == null) return;
            int found = currentMatchPages == null ? 0 : currentMatchPages.size();
            if (searchScanTotal <= 0) {
                // No page count yet. A percentage would sit on 0, and a bare
                // "Opening file…" left the reader wondering whether anything
                // was happening at all, so count the seconds out loud.
                long secs = (SystemClock.uptimeMillis() - searchStartedAt) / 1000;
                searchLabel.setText(secs < 2 ? "Opening file…" : ("Opening file… " + secs + "s"));
            } else {
                int pct = searchScanDone * 100 / searchScanTotal;
                searchLabel.setText(found > 0
                        ? found + " found · " + pct + "%"
                        : "Searching " + pct + "%");
            }
            mainHandler.postDelayed(this, 200);
        }
    };

    // Asks the viewer to re-render at its current position. Same trick the
    // idle poller uses (jumpTo() would snap to a page top and lose the
    // reader's place); harmless if the document is already drawn.
    private void nudgeRedraw(long delayMs) {
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (pdfView == null || isFinishing() || isDestroyed()) return;
                try {
                    // loadPages() re-renders what is on screen WITHOUT touching the scroll
                        // position. Re-applying a position offset (as this used to) nudged
                        // the view a little each time, which after a pinch-zoom looked like
                        // the area you had just zoomed into jumping upwards.
                        pdfView.loadPages();
                } catch (Exception ignored) {
                    // Document recycled meanwhile -- nothing to redraw.
                }
            }
        }, delayMs);
    }

    private void startSearchTicker() {
        searchStartedAt = SystemClock.uptimeMillis();
        searchScanDone = 0;
        searchScanTotal = 0;
        extractionCancelled = false;
        if (!searchTicking) {
            searchTicking = true;
            mainHandler.post(searchTickRunnable);
        }
    }

    // Back during a long search stops the search and stays in the viewer --
    // leaving mid-extraction is both surprising ("where did my document go?")
    // and the moment the old build was most likely to die. Wired into the
    // OnBackPressedCallback in onCreate (this Activity never sees
    // onBackPressed(): the dispatcher callback consumes it first) and into the
    // toolbar's own back button.
    private void cancelRunningSearch() {
        extractionCancelled = true;
        cancelDeepSweep();
        stopSearchTicker();
        lastSearchQuery = null;
        setSearchStepEnabled(false);
        if (searchLabel != null) {
            searchLabel.setTextColor(Color.parseColor("#9FB6E8"));
            searchLabel.setText("Search stopped");
        }
    }

    private void stopSearchTicker() {
        searchTicking = false;
        mainHandler.removeCallbacks(searchTickRunnable);
    }

    private void performSearch(String rawQuery) {
        final String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.isEmpty()) return;


        // Show progress in the bar itself (same "tab" the results land in)
        // instead of a Toast that vanishes on its own timer. Prev/next
        // disabled meanwhile -- there's no result set to step through yet.
        currentMatchPages = null; currentPageRanges = null; currentPageRangeCount = 0; currentRangeIndex = 0;
        lastSearchQuery = query;
        if (textSelectionOverlay != null) textSelectionOverlay.clearSearchMatches();
        searchBar.setVisibility(View.VISIBLE);
        if (searchInput != null && !query.equals(searchInput.getText().toString())) {
            searchInput.setText(query);
        }
        searchLabel.setTextColor(Color.parseColor("#9FB6E8"));
        setSearchStepEnabled(false);
        liveSearchQuery = query;
        // A first search on a big document spends a long time in
        // PDDocument.load() BEFORE page 1 is ever read, so page counts alone
        // leave the label frozen. The ticker animates from the first frame and
        // switches to "page N of M" as soon as the extractor starts counting.
        startSearchTicker();

        ensurePageTextsExtracted(new Runnable() {
            @Override
            public void run() {
                stopSearchTicker();
                final List<Integer> matchPages = new ArrayList<>();
                String queryLower = query.toLowerCase();
                for (int i = 0; i < pageTextsCache.size(); i++) {
                    if (pageTextsCache.get(i).toLowerCase().contains(queryLower)) {
                        matchPages.add(i);
                    }
                }
                if (matchPages.isEmpty()) {
                    offerDeepSearch(query, false);
                    return;
                }
                currentMatchPages = matchPages;
                currentMatchIndex = 0;
                setSearchStepEnabled(true);
                jumpToCurrentMatch();
                // Text matches are not the whole story: on a drawing sheet every
                // tag is vector outlines, so those pages can hold the word and
                // never match. Offer to read them too instead of quietly
                // reporting only the pages that happen to carry real text.
                offerDeepSearch(query, true);
            }
        }, new ExtractionProgress() {
            @Override
            public void onProgress(int done, int total) {
                // Only while this search is still the one running.
                if (!query.equals(lastSearchQuery)) return;
                searchScanDone = done;
                searchScanTotal = total;
            }
        });
    }

    // A plain text search found nothing. If some pages look image-only (or a
    // CAD export where the text is really vector outlines), the words may
    // genuinely be on the page but unextractable -- OCR can still find them.
    // Deliberately opt-in and never automatic: this renders each candidate
    // page to a bitmap and runs ML Kit over it, which on a 200-page drawing
    // set is minutes of work, not something to spring on someone who just
    // mistyped a word.
    private void offerDeepSearch(final String query) {
        offerDeepSearch(query, false);
    }

    // haveMatches: text matches are already on screen, so the labels must not
    // be overwritten with "No matches" and the question becomes "also search
    // the drawings?" rather than "search anyway?".
    private void offerDeepSearch(final String query, final boolean haveMatches) {
        int candidates = pageTextsSparsePages == null ? 0 : pageTextsSparsePages.size();
        android.util.Log.i("DOCMANHL", "offerDeepSearch candidates=" + candidates
                + " done=" + deepSearchDone + " haveMatches=" + haveMatches
                + " pro=" + isPro + " ocrUnlocked=" + ocrUnlockedThisVisit);
        if (deepSearchDone || candidates == 0) {
            if (haveMatches) return;
            searchLabel.setTextColor(Color.parseColor("#F8A5B4"));
            searchLabel.setText("No matches");
            return;
        }
        // Reading scanned pages needs Pro or the unused free try. A free user
        // keeps the normal text search above either way, and only a search
        // they started can ask -- never background work.
        final boolean usingFreeTry = !isPro && !ocrUnlockedThisVisit;
        if (usingFreeTry && !freeTries.contains("ocr")) {
            if (haveMatches) return;   // keep the matches already found
            searchLabel.setTextColor(Color.parseColor("#F8A5B4"));
            searchLabel.setText("No matches");
            showToolLockedDialog("ocr");
            return;
        }

        // A short scan (a receipt, a one-page form) used to OCR transparently
        // during extraction, and asking about it would be worse than just
        // doing it. Only a document large enough for the wait to be genuinely
        // noticeable is worth interrupting for.
        // Spending the free try is always asked, never automatic.
        if (candidates <= AUTO_OCR_PAGE_LIMIT && !usingFreeTry) {
            runDeepSearch(query);
            return;
        }
        if (!haveMatches) {
            searchLabel.setTextColor(Color.parseColor("#F8A5B4"));
            searchLabel.setText("No matches");
        }
        if (deepSearchDialog != null && deepSearchDialog.isShowing()) return; // already asking
        deepSearchDialog = new android.app.AlertDialog.Builder(this)
                .setTitle(haveMatches ? "Also search drawings?" : "Search scanned pages?")
                .setMessage((haveMatches ? "Found matches in the text pages. " : "No text matches. ")
                        + candidates + (candidates == 1 ? " page has" : " pages have")
                        + " little or no readable text — they may be scans or drawings, where the words are"
                        + " drawn as lines rather than written as text. Reading them can find the word there"
                        + " too, but takes a while."
                        + (usingFreeTry ? "\n\nThis uses your one free try of reading scanned pages." : ""))
                .setNegativeButton(haveMatches ? "No thanks" : "Cancel", null)
                .setPositiveButton(haveMatches ? "Search drawings" : "Search anyway", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) { runDeepSearch(query); }
                })
                .show();
    }

    // Entry point for the More menu: make sure there is a word to look for and
    // that the document has been read once, then sweep the drawings.
    private void startDrawingSearch() {
        final String query = lastSearchQuery != null && !lastSearchQuery.isEmpty()
                ? lastSearchQuery
                : (searchInput == null ? "" : searchInput.getText().toString().trim());
        if (query.isEmpty()) {
            showSearchDialog();
            showNotice(NOTICE_OK, "Type a word first, then try again", null);
            return;
        }
        deepSearchDone = false;
        if (pageTextsCache == null) {
            searchBar.setVisibility(View.VISIBLE);
            lastSearchQuery = query;
            startSearchTicker();
            ensurePageTextsExtracted(new Runnable() {
                @Override
                public void run() {
                    stopSearchTicker();
                    runDeepSearch(query);
                }
            }, new ExtractionProgress() {
                @Override
                public void onProgress(int done, int total) {
                    searchScanDone = done;
                    searchScanTotal = total;
                }
            });
            return;
        }
        searchBar.setVisibility(View.VISIBLE);
        lastSearchQuery = query;
        runDeepSearch(query);
    }

    private void runDeepSearch(final String query) {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        final boolean spendsOcrTry = !isPro && !ocrUnlockedThisVisit;
        if (spendsOcrTry && !freeTries.contains("ocr")) return; // see offerDeepSearch()
        if (pageTextsSparsePages == null || pageTextsSparsePages.isEmpty()) return;

        // Nearest pages first: on a set this size the drawing in front of the
        // reader matters far more than page 1, so a hit near them arrives in
        // seconds instead of at the end of the sweep.
        final List<Integer> pages = new ArrayList<>(pageTextsSparsePages);
        final int from = pdfView == null ? 0 : pdfView.getCurrentPage();
        java.util.Collections.sort(pages, new java.util.Comparator<Integer>() {
            @Override
            public int compare(Integer a, Integer b) {
                return Integer.compare(Math.abs(a - from), Math.abs(b - from));
            }
        });
        extractionCancelled = false;
        liveSearchQuery = query;
        searchLabel.setTextColor(Color.parseColor("#9FB6E8"));
        searchLabel.setText("Reading 0/" + pages.size() + "…");

        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                // Reading a page as an image is the expensive part, so several
                // run at once. This stays in the app process on purpose: the
                // same work measured less than half as fast in the helper,
                // which Android gives less CPU.
                final int workers = Math.max(2, Math.min(5,
                        Runtime.getRuntime().availableProcessors() - 2));
                final java.util.concurrent.ExecutorService pool =
                        Executors.newFixedThreadPool(workers);
                final java.util.concurrent.atomic.AtomicInteger doneCount =
                        new java.util.concurrent.atomic.AtomicInteger();
                try {
                    for (int n = 0; n < pages.size(); n++) {
                        if (extractionCancelled) break;
                        final int pageIndex = pages.get(n);
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                if (extractionCancelled) return;
                                final int done = doneCount.incrementAndGet();
                                mainHandler.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (!searchTicking) {
                                            searchLabel.setText("Reading " + done + "/" + pages.size() + "…");
                                        }
                                    }
                                });
                                try {
                                    PageTextLayout layout = pageLayoutFromPdfium(pageIndex);
                                    if (layout == null || layout.pageWidthPts <= 0) return;
                                    int before = layout.chars.size();
                                    runOcrFallback(layout, pageIndex, 1.8f);
                                    layout.ocrDone = true;

                                    StringBuilder sb = new StringBuilder();
                                    CharBox hit = null;
                                    for (int c = before; c < layout.chars.size(); c++) {
                                        CharBox cb = layout.chars.get(c);
                                        if (cb.ch == null) continue;
                                        sb.append(cb.ch).append(' ');
                                        if (hit == null && cb.ch.toLowerCase().contains(query.toLowerCase())) {
                                            hit = cb;
                                        }
                                    }
                                    String ocr = sb.toString().trim();
                                    if (!ocr.isEmpty() && pageTextsCache != null
                                            && pageIndex < pageTextsCache.size()) {
                                        // Append: whatever real text the page
                                        // had stays searchable too.
                                        pageTextsCache.set(pageIndex, pageTextsCache.get(pageIndex) + "\n" + ocr);
                                    }
                                    if (pageTextLayoutCache != null && pageIndex < pageTextLayoutCache.size()) {
                                        pageTextLayoutCache.set(pageIndex, layout);
                                    }
                                    if (hit != null) {
                                        final CharBox box = hit;
                                        final float pw = layout.pageWidthPts, ph = layout.pageHeightPts;
                                        mainHandler.post(new Runnable() {
                                            @Override
                                            public void run() {
                                                if (textSelectionOverlay != null) {
                                                    textSelectionOverlay.setQuickSearchRect(pageIndex,
                                                            box.x, box.y, box.width, box.height, pw, ph);
                                                }
                                                onLiveMatch(pageIndex);
                                            }
                                        });
                                    }
                                } catch (Throwable perPage) {
                                    // Skip this page; the sweep carries on.
                                }
                            }
                        });
                    }
                    pool.shutdown();
                    pool.awaitTermination(6, java.util.concurrent.TimeUnit.HOURS);
                } catch (Exception e) {
                    // Fall through with whatever was read.
                } finally {
                    pool.shutdownNow();
                }
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (spendsOcrTry) {
                            ocrUnlockedThisVisit = true;
                            spendFreeTry(getApplicationContext(), "ocr");
                            forgetLayoutsBuiltWithoutOcr();
                        }
                        deepSearchDone = true;
                        // Keep what the sweep read: this document never needs
                        // reading again.
                        if (searchExecutor != null && !searchExecutor.isShutdown() && pageTextsCache != null) {
                            final List<String> snapshot = new ArrayList<>(pageTextsCache);
                            searchExecutor.execute(new Runnable() {
                                @Override
                                public void run() { saveTextCache(snapshot); }
                            });
                        }
                        performSearch(query);
                    }
                });
            }
        });
    }

    // Stops a running drawing sweep (back pressed, or the viewer closing).
    private void cancelDeepSweep() {
        extractionCancelled = true;
    }

    // Folds the swept pages' recognised text into the page texts, then saves
    // the lot so this document is never swept again.
    private void mergeSweptText(final File f) {
        if (searchExecutor == null || searchExecutor.isShutdown()) return;
        searchExecutor.execute(new Runnable() {
            @Override
            public void run() {
                java.io.DataInputStream in = null;
                try {
                    in = new java.io.DataInputStream(new java.io.BufferedInputStream(
                            new java.io.FileInputStream(f), 64 * 1024));
                    int count = in.readInt();
                    for (int i = 0; i < count; i++) {
                        int page = in.readInt();
                        int len = in.readInt();
                        byte[] buf = new byte[len];
                        in.readFully(buf);
                        String text = new String(buf, "UTF-8");
                        if (text.isEmpty() || pageTextsCache == null || page >= pageTextsCache.size()) continue;
                        // Append: whatever real text the page had stays searchable.
                        pageTextsCache.set(page, pageTextsCache.get(page) + "\n" + text);
                    }
                    saveTextCache(new ArrayList<>(pageTextsCache));
                } catch (Throwable ignored) {
                    // A failed merge just means this document gets swept again.
                } finally {
                    if (in != null) { try { in.close(); } catch (Exception ignored) { } }
                    f.delete();
                }
            }
        });
    }

    private void stepSearchMatch(int delta) {
        if (currentMatchPages == null || currentMatchPages.isEmpty()) return;
        // Several hits on this page: walk through them before changing page.
        int next = currentRangeIndex + delta;
        if (currentPageRangeCount > 1 && next >= 0 && next < currentPageRangeCount) {
            currentRangeIndex = next;
            showActiveSearchRange();
            return;
        }
        int size = currentMatchPages.size();
        currentMatchIndex = ((currentMatchIndex + delta) % size + size) % size;
        stepToLastRangeOnPage = delta < 0; // going back lands on the page's last hit
        jumpToCurrentMatch();
    }

    private void jumpToCurrentMatch() {
        if (currentMatchPages == null || currentMatchPages.isEmpty()) return;
        final int page = currentMatchPages.get(currentMatchIndex);
        android.util.Log.i("DOCMANHL", "jump to match " + (currentMatchIndex + 1) + "/" + currentMatchPages.size()
                + " page=" + page + " cachedText="
                + (pageTextsCache != null && page < pageTextsCache.size()
                   ? pageTextsCache.get(page).toLowerCase().contains(lastSearchQuery.toLowerCase()) : false));
        currentRangeIndex = 0;
        currentPageRangeCount = 0;
        pdfView.jumpTo(page, false);
        updateSearchLabel();
        highlightMatchesOnPage(page);
    }

    // Page-level discovery (above) is cheap and works on OCR'd pages, but on
    // its own it only gets the reader to the right page. This resolves where
    // on that page the word actually is, using the same CharBox layout text
    // selection uses, and hands the ranges to the overlay to draw.
    private void highlightMatchesOnPage(final int page) {
        if (textSelectionOverlay == null || lastSearchQuery == null || lastSearchQuery.isEmpty()) return;
        textSelectionOverlay.clearSearchMatches();
        ensurePageTextLayoutForPage(page, new Runnable() {
            @Override
            public void run() {
                if (pageTextLayoutCache == null || page < 0 || page >= pageTextLayoutCache.size()) return;
                PageTextLayout layout = pageTextLayoutCache.get(page);
                if (layout == null || layout.chars.isEmpty()) return;

                // Build a searchable string alongside a map back to CharBox
                // indices. OCR entries hold a whole word rather than one
                // character, so they get a separating space -- without it
                // "coupling" and the next word would run together and a
                // query could match across a gap that isn't really there.
                StringBuilder sb = new StringBuilder();
                List<Integer> idxMap = new ArrayList<>();
                for (int i = 0; i < layout.chars.size(); i++) {
                    CharBox c = layout.chars.get(i);
                    String s = c.ch == null ? "" : c.ch;
                    for (int k = 0; k < s.length(); k++) idxMap.add(i);
                    sb.append(s);
                    if (c.wholeUnit) { sb.append(' '); idxMap.add(i); }
                }

                String hay = sb.toString().toLowerCase();
                String needle = lastSearchQuery.toLowerCase();
                List<int[]> ranges = new ArrayList<>();
                int from = 0;
                while (true) {
                    int at = hay.indexOf(needle, from);
                    if (at < 0) break;
                    int endPos = Math.min(at + needle.length() - 1, idxMap.size() - 1);
                    if (at < idxMap.size()) {
                        ranges.add(new int[]{ idxMap.get(at), idxMap.get(endPos) });
                    }
                    from = at + Math.max(1, needle.length());
                }
                android.util.Log.i("DOCMANHL", "page=" + page + " chars=" + layout.chars.size()
                        + " hay=" + hay.length() + " needle='" + needle + "' ranges=" + ranges.size()
                        + (hay.length() > 0 ? " sample='" + hay.substring(0, Math.min(80, hay.length())) + "'" : ""));
                if (ranges.isEmpty()) return;

                // A late result for a page the reader has already left must
                // not move them back.
                boolean isCurrent = currentMatchPages != null
                        && currentMatchIndex < currentMatchPages.size()
                        && currentMatchPages.get(currentMatchIndex) == page;
                if (!isCurrent) {
                    textSelectionOverlay.setSearchMatches(page, ranges, 0);
                    return;
                }
                currentSearchPage = page;
                currentPageRanges = ranges;
                currentPageRangeCount = ranges.size();
                currentRangeIndex = stepToLastRangeOnPage ? ranges.size() - 1 : 0;
                stepToLastRangeOnPage = false;
                textSelectionOverlay.setSearchMatches(page, ranges, currentRangeIndex);
                updateSearchLabel();
                zoomToActiveSearchMatch();
                textSelectionOverlay.post(new Runnable() {
                    @Override
                    public void run() {
                        android.graphics.RectF r = textSelectionOverlay.searchMatchRect(currentRangeIndex);
                        android.util.Log.i("DOCMANHL", "rect=" + (r == null ? "null" : r.toShortString())
                                + " view=" + textSelectionOverlay.getWidth() + "x" + textSelectionOverlay.getHeight()
                                + " vis=" + (textSelectionOverlay.getVisibility() == View.VISIBLE)
                                + " zoom=" + pdfView.getZoom());
                    }
                });
            }
        });
    }

    // "1 of 4" counts match PAGES; when a page holds several hits the label
    // also shows which one is active ("1 of 4 · 2/3").
    private void updateSearchLabel() {
        if (currentMatchPages == null || currentMatchPages.isEmpty()) return;
        String label = (currentMatchIndex + 1) + " of " + currentMatchPages.size();
        if (currentPageRangeCount > 1) label += " · " + (currentRangeIndex + 1) + "/" + currentPageRangeCount;
        searchLabel.setText(label);
    }

    // Moves the active highlight to another hit on the same page.
    private void showActiveSearchRange() {
        if (textSelectionOverlay == null || currentPageRanges == null) return;
        textSelectionOverlay.setSearchMatches(currentSearchPage, currentPageRanges, currentRangeIndex);
        updateSearchLabel();
        zoomToActiveSearchMatch();
    }

    // On a dense page (drawings, small print) landing on the right page still
    // left people hunting for the highlight. This zooms until the active
    // match is comfortably readable and glides it to the middle of the
    // screen. It never zooms OUT, so someone already zoomed in further keeps
    // their zoom. Each frame re-reads where the match actually is, because
    // PDFView clamps offsets at page edges and a remembered position drifts.
    private void zoomToActiveSearchMatch() {
        if (textSelectionOverlay == null || pdfView == null) return;
        final int idx = currentRangeIndex;
        pdfView.post(new Runnable() {
            @Override
            public void run() {
                android.graphics.RectF r = textSelectionOverlay.searchMatchRect(idx);
                final int w = pdfView.getWidth();
                final int h = pdfView.getHeight();
                if (r == null || w <= 0 || h <= 0 || r.height() <= 0) return;
                if (searchZoomAnimator != null) searchZoomAnimator.cancel();
                pdfView.stopFling();

                final float startZoom = pdfView.getZoom();
                // Reading size, with the rest of the line still in view.
                float target = startZoom * (dp(11) / r.height()); // PDFBox glyph boxes are ~60% of the visible text height
                if (r.width() > 0) target = Math.min(target, startZoom * (w * 0.3f / r.width()));
                target = Math.min(target, Math.min(pdfView.getMaxZoom(), 6f));
                // DOCMAN remembers each document's zoom, so a page can open far
                // larger than reading size (a zoom left from an earlier visit).
                // Zoom out in that case; otherwise keep a zoom the reader chose.
                final float endZoom = startZoom > target * 1.6f
                        ? Math.max(1f, target)
                        : Math.max(startZoom, target);

                final float startX = r.centerX();
                final float startY = r.centerY();
                final float endX = w / 2f;
                final float endY = h * 0.42f; // a little above centre, clear of the toolbar

                searchZoomAnimator = android.animation.ValueAnimator.ofFloat(0f, 1f);
                searchZoomAnimator.setDuration(380);
                searchZoomAnimator.setInterpolator(new android.view.animation.DecelerateInterpolator());
                searchZoomAnimator.addUpdateListener(new android.animation.ValueAnimator.AnimatorUpdateListener() {
                    @Override
                    public void onAnimationUpdate(android.animation.ValueAnimator a) {
                        android.graphics.RectF cur = textSelectionOverlay.searchMatchRect(idx);
                        if (cur == null) return;
                        float f = (float) a.getAnimatedValue();
                        android.graphics.PointF p = new android.graphics.PointF(cur.centerX(), cur.centerY());
                        // Zooming around the match keeps it where it is on screen...
                        pdfView.zoomCenteredTo(startZoom + (endZoom - startZoom) * f, p);
                        // ...and this slides it toward the middle.
                        float nx = startX + (endX - startX) * f;
                        float ny = startY + (endY - startY) * f;
                        pdfView.moveRelativeTo(nx - p.x, ny - p.y);
                    }
                });
                searchZoomAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(android.animation.Animator a) {
                        pdfView.loadPages();
                        textSelectionOverlay.invalidate();
                    }
                });
                searchZoomAnimator.start();
            }
        });
    }

    private void closeSearchBar() {
        hideSearchKeyboard();
        searchBar.setVisibility(View.GONE);
        currentMatchPages = null; currentPageRanges = null; currentPageRangeCount = 0; currentRangeIndex = 0;
        lastSearchQuery = null;
        if (searchInput != null) searchInput.setText("");
        if (textSelectionOverlay != null) textSelectionOverlay.clearSearchMatches();
    }

    // ============================================================
    // PRINT
    // ============================================================
    // Hands the raw PDF bytes straight to Android's print framework via a
    // PrintDocumentAdapter -- the OS-level Print dialog (and whatever
    // printers/PDF-save options it offers) handles rendering, not us.
    // Uses only stock android.print classes, not the Pdfium library.

    private void printCurrentDocument() {
        if (pdfPath == null || pdfPath.isEmpty()) {
            showNotice(NOTICE_INFO, "Nothing to print", null);
            return;
        }
        android.print.PrintManager printManager =
                (android.print.PrintManager) getSystemService(android.content.Context.PRINT_SERVICE);
        if (printManager == null) {
            showNotice(NOTICE_ERROR, "Printing isn't available", "This phone has no print service");
            return;
        }
        final String jobName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "Document";

        android.print.PrintDocumentAdapter adapter = new android.print.PrintDocumentAdapter() {
            @Override
            public void onLayout(android.print.PrintAttributes oldAttributes,
                                  android.print.PrintAttributes newAttributes,
                                  android.os.CancellationSignal cancellationSignal,
                                  LayoutResultCallback callback, Bundle extras) {
                if (cancellationSignal.isCanceled()) {
                    callback.onLayoutCancelled();
                    return;
                }
                android.print.PrintDocumentInfo info = new android.print.PrintDocumentInfo.Builder(jobName)
                        .setContentType(android.print.PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .build();
                callback.onLayoutFinished(info, true);
            }

            @Override
            public void onWrite(android.print.PageRange[] pages,
                                 ParcelFileDescriptor destination,
                                 android.os.CancellationSignal cancellationSignal,
                                 WriteResultCallback callback) {
                java.io.InputStream in = null;
                java.io.OutputStream out = null;
                try {
                    if (pdfPath.startsWith("content://")) {
                        in = getContentResolver().openInputStream(Uri.parse(pdfPath));
                    } else if (pdfPath.startsWith("file://")) {
                        in = new java.io.FileInputStream(new File(Uri.parse(pdfPath).getPath()));
                    } else {
                        in = new java.io.FileInputStream(new File(pdfPath));
                    }
                    if (in == null) {
                        callback.onWriteFailed("Could not open document");
                        return;
                    }
                    out = new java.io.FileOutputStream(destination.getFileDescriptor());
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = in.read(buf)) > 0) {
                        if (cancellationSignal.isCanceled()) {
                            callback.onWriteCancelled();
                            return;
                        }
                        out.write(buf, 0, len);
                    }
                    callback.onWriteFinished(new android.print.PageRange[]{android.print.PageRange.ALL_PAGES});
                } catch (Exception e) {
                    callback.onWriteFailed(e.getMessage());
                } finally {
                    try { if (in != null) in.close(); } catch (Exception ignored) { }
                    try { if (out != null) out.close(); } catch (Exception ignored) { }
                }
            }
        };

        printManager.print(jobName, adapter, null);
    }


    private void toggleNightMode() {
        nightModeEnabled = !nightModeEnabled;
        getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE).edit().putBoolean("nightMode", nightModeEnabled).apply();
        // nightMode is Configurator-time-only in this library -- no runtime
        // setter exists, so applying it means reloading. Land back on the
        // same page/zoom so the toggle feels seamless rather than resetting.
        loadPdf(pdfView.getCurrentPage(), pdfView.getZoom());
        showNotice(NOTICE_INFO, nightModeEnabled ? "Night mode on" : "Night mode off", null);
    }

    private void toggleScrollDirection() {
        horizontalScrollEnabled = !horizontalScrollEnabled;
        getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE).edit().putBoolean("horizontalScroll", horizontalScrollEnabled).apply();
        loadPdf(pdfView.getCurrentPage(), pdfView.getZoom());
        showNotice(NOTICE_INFO, horizontalScrollEnabled ? "Horizontal scrolling" : "Vertical scrolling", null);
    }

    // Side-by-side spread: forces horizontal layout (see loadPdf()'s
    // effectiveHorizontal) and zooms out to TWO_PAGE_ZOOM so two consecutive
    // pages fit the screen width at once. Turning it back off restores
    // whatever zoom/scroll-direction preference was active before.
    private void toggleTwoPageView() {
        twoPageViewEnabled = !twoPageViewEnabled;
        getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE).edit().putBoolean("twoPageView", twoPageViewEnabled).apply();
        loadPdf(pdfView.getCurrentPage(), twoPageViewEnabled ? TWO_PAGE_ZOOM_SENTINEL : -1f);
        showNotice(NOTICE_INFO, twoPageViewEnabled ? "Two-page view" : "Single-page view", null);
    }

    // ============================================================
    // FULL SCREEN MODE
    // ============================================================

    // The page used to be laid out behind the top bar and the bottom strip, so
    // the first lines of every page sat under the title bar and the page
    // counter slid up under it too. Padding the container keeps the page
    // between them, and the padding follows whatever the bars are doing.
    private void applyChromeInsets() {
        if (pdfContainer == null) return;
        int top = (toolbar != null && toolbar.getVisibility() == View.VISIBLE) ? toolbar.getHeight() : 0;
        int bottom = (bottomToolStrip != null && bottomToolStrip.getVisibility() == View.VISIBLE)
                ? bottomToolStrip.getHeight() : 0;
        if (pdfContainer.getPaddingTop() == top && pdfContainer.getPaddingBottom() == bottom) return;
        pdfContainer.setPadding(0, top, 0, bottom);
    }

    private void watchChromeForInsets() {
        View.OnLayoutChangeListener l = new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int a, int b, int c, int d, int e, int f, int g, int h) {
                applyChromeInsets();
            }
        };
        if (toolbar != null) toolbar.addOnLayoutChangeListener(l);
        if (bottomToolStrip != null) bottomToolStrip.addOnLayoutChangeListener(l);
        if (pdfContainer != null) pdfContainer.post(new Runnable() {
            @Override
            public void run() { applyChromeInsets(); }
        });
    }

    private void toggleFullScreen() {
        isFullScreen = !isFullScreen;
        Window window = getWindow();
        if (isFullScreen) {
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
            if (toolbar != null) toolbar.setVisibility(View.GONE);
            if (secondaryBar != null) secondaryBar.setVisibility(View.GONE);
            if (bottomToolStrip != null) bottomToolStrip.setVisibility(View.GONE);
            applyChromeInsets();
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            if (toolbar != null) toolbar.setVisibility(View.VISIBLE);
            // page counter stays hidden -- see the layout comment
            if (bottomToolStrip != null) bottomToolStrip.setVisibility(View.VISIBLE);
            if (pdfContainer != null) pdfContainer.post(new Runnable() {
                @Override
                public void run() { applyChromeInsets(); }
            });
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-assert immersive flags -- the system nudges them back on focus
        // changes (e.g. returning from the Jump to Page dialog), which would
        // otherwise silently pop the nav bar back in while full screen.
        if (hasFocus && isFullScreen) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    // ============================================================
    // PAGE THUMBNAILS
    // ============================================================
    // Renders each page to a small bitmap on a background thread using a
    // second, short-lived PdfiumCore document (kept completely separate
    // from the main pdfView's own PdfiumCore instance, so thumbnail work
    // can never interfere with the visible page's rendering). Thumbnails
    // are generated lazily, one at a time, and posted to the grid as they
    // finish rather than blocking the dialog open on the whole document --
    // this is the "lazy loading" behavior applied to the thumbnail strip
    // itself, on top of the library's own lazy page rendering.
    private void showThumbnailsDialog() {
        if (lastKnownPageCount <= 0 || pdfPath == null) return;

        final Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(Color.parseColor("#0A0E1F"));
        final GridLayout grid = new GridLayout(this);
        grid.setColumnCount(3);
        int gridPad = dp(12);
        grid.setPadding(gridPad, gridPad + dp(40), gridPad, gridPad);
        scrollView.addView(grid);

        ImageButton closeBtn = new ImageButton(this);
        closeBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeBtn.setBackgroundColor(Color.TRANSPARENT);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { dialog.dismiss(); }
        });

        FrameLayout root = new FrameLayout(this);
        root.addView(scrollView);
        FrameLayout.LayoutParams closeLp = new FrameLayout.LayoutParams(dp(48), dp(48));
        closeLp.gravity = Gravity.TOP | Gravity.END;
        closeLp.setMargins(0, dp(4), dp(4), 0);
        root.addView(closeBtn, closeLp);

        dialog.setContentView(root);
        dialog.show();

        int screenW = getResources().getDisplayMetrics().widthPixels;
        final int cellSize = (screenW - gridPad * 2) / 3 - dp(8);

        // Every open of this dialog gets its own generation, so thumbnails
        // still being rendered for a dialog the user already closed are
        // dropped instead of being pushed into recycled views.
        final int generation = ++thumbnailGeneration;
        final ImageView[] cells = new ImageView[lastKnownPageCount];
        final View[] cellRoots = new View[lastKnownPageCount];
        final boolean[] rendered = new boolean[lastKnownPageCount];

        for (int i = 0; i < lastKnownPageCount; i++) {
            final int pageIndex = i;
            final ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setBackgroundColor(Color.parseColor("#1A1F3A"));
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = cellSize;
            lp.height = (int) (cellSize * 1.3f);
            lp.setMargins(dp(4), dp(4), dp(4), dp(4));
            lp.columnSpec = GridLayout.spec(i % 3);
            iv.setLayoutParams(lp);

            TextView label = new TextView(this);
            label.setText(String.valueOf(pageIndex + 1));
            label.setTextColor(Color.WHITE);
            label.setTextSize(10);
            label.setGravity(Gravity.CENTER);

            FrameLayout cell = new FrameLayout(this);
            cell.addView(iv);
            FrameLayout.LayoutParams labelLp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            labelLp.gravity = Gravity.BOTTOM | Gravity.END;
            labelLp.setMargins(0, 0, dp(4), dp(2));
            cell.addView(label, labelLp);
            cell.setLayoutParams(lp);

            cell.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    pdfView.jumpTo(pageIndex, true);
                    dialog.dismiss();
                }
            });

            grid.addView(cell);
            cells[pageIndex] = iv;
            cellRoots[pageIndex] = cell;
        }

        // Rendering all of them at once was the old behaviour, and it cost
        // roughly 280 KB per page: a 400-page manual meant ~110 MB of
        // bitmaps held by the grid at once, which is an OutOfMemoryError on
        // a mid-range phone. Only pages near the viewport are rendered, and
        // ones scrolled well away are released again.
        final Runnable updateVisibleThumbnails = new Runnable() {
            @Override
            public void run() {
                if (generation != thumbnailGeneration) return;
                Rect visible = new Rect();
                scrollView.getDrawingRect(visible);
                int margin = Math.max(dp(400), visible.height());
                for (int p = 0; p < cells.length; p++) {
                    View cellRoot = cellRoots[p];
                    if (cellRoot == null || cells[p] == null) continue;
                    int top = cellRoot.getTop() + grid.getTop();
                    int bottom = top + cellRoot.getHeight();
                    if (bottom <= 0 && top <= 0 && cellRoot.getHeight() == 0) continue; // not laid out yet
                    boolean near = bottom >= visible.top - margin && top <= visible.bottom + margin;
                    boolean farAway = bottom < visible.top - margin * 3 || top > visible.bottom + margin * 3;
                    if (near && !rendered[p]) {
                        rendered[p] = true;
                        renderThumbnailAsync(p, cellSize, cells[p], generation);
                    } else if (farAway && rendered[p]) {
                        rendered[p] = false;
                        cells[p].setImageDrawable(null);
                    }
                }
            }
        };

        scrollView.getViewTreeObserver().addOnGlobalLayoutListener(
                new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                    @Override
                    public void onGlobalLayout() {
                        updateVisibleThumbnails.run();
                    }
                });
        scrollView.setOnScrollChangeListener(new View.OnScrollChangeListener() {
            @Override
            public void onScrollChange(View v, int x, int y, int oldX, int oldY) {
                updateVisibleThumbnails.run();
            }
        });
        dialog.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(android.content.DialogInterface d) {
                // Retires this generation and drops the bitmaps immediately
                // rather than waiting for the grid itself to be collected.
                thumbnailGeneration++;
                for (ImageView cell : cells) {
                    if (cell != null) cell.setImageDrawable(null);
                }
            }
        });
        scrollView.post(updateVisibleThumbnails);
    }

    private int thumbnailGeneration = 0;

    private void renderThumbnailAsync(final int pageIndex, final int targetSize, final ImageView target, final int generation) {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                if (generation != thumbnailGeneration) return; // dialog already closed
                Bitmap bmp = renderSinglePageThumbnail(pageIndex, targetSize);
                if (bmp == null) return;
                final Bitmap finalBmp = bmp;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (generation != thumbnailGeneration) { finalBmp.recycle(); return; }
                        target.setImageBitmap(finalBmp);
                    }
                });
            }
        });
    }

    // Opens its own short-lived PdfiumCore document+page, renders one
    // thumbnail, and closes everything before returning -- never holds a
    // second full document open longer than a single page render.
    private Bitmap renderSinglePageThumbnail(int pageIndex, int targetSize) {
        ParcelFileDescriptor pfd = null;
        PdfiumCore core = null;
        PdfDocument doc = null;
        try {
            core = new PdfiumCore(this);
            if (pdfPath.startsWith("content://")) {
                pfd = getContentResolver().openFileDescriptor(Uri.parse(pdfPath), "r");
            } else if (pdfPath.startsWith("file://")) {
                pfd = ParcelFileDescriptor.open(new File(Uri.parse(pdfPath).getPath()), ParcelFileDescriptor.MODE_READ_ONLY);
            } else {
                pfd = ParcelFileDescriptor.open(new File(pdfPath), ParcelFileDescriptor.MODE_READ_ONLY);
            }
            if (pfd == null) return null;

            doc = core.newDocument(pfd);
            core.openPage(doc, pageIndex);
            int pageW = core.getPageWidthPoint(doc, pageIndex);
            int pageH = core.getPageHeightPoint(doc, pageIndex);
            if (pageW <= 0 || pageH <= 0) return null;

            float scale = targetSize / (float) pageW;
            int outW = targetSize;
            int outH = Math.max(1, (int) (pageH * scale));

            // RGB_565, not ARGB_8888 -- thumbnails don't need alpha and this
            // halves the memory cost across potentially hundreds of pages.
            Bitmap bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.RGB_565);
            core.renderPageBitmap(doc, bitmap, pageIndex, 0, 0, outW, outH);
            return bitmap;
        } catch (OutOfMemoryError e) {
            return null;
        } catch (Exception e) {
            return null;
        } finally {
            try { if (doc != null && core != null) core.closeDocument(doc); } catch (Exception ignored) { }
            try { if (pfd != null) pfd.close(); } catch (Exception ignored) { }
        }
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}