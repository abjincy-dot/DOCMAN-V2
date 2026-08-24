// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfViewerActivity.java
//
// Replace "com.oarcel.docman" with YOUR app's real package name.

package com.oarcel.docman;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
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
    private ImageButton markBtn;
    private ImageButton bookmarkBtn;
    private ImageButton bookmarkPageBtn;
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
    private String docId = "";
    private int lastKnownPage = 0;
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
    private TextView searchLabel;
    private ImageButton searchPrevBtn;
    private ImageButton searchNextBtn;
    private List<Integer> currentMatchPages = null;
    private int currentMatchIndex = 0;

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
                    Toast.makeText(PdfViewerActivity.this,
                            "Still preparing this document's text -- try again in a moment",
                            Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onPageTextNeeded(final int pageIndex, final float touchX, final float touchY) {
                // One-time, not per-attempt: the slow part is the document's
                // first parse (textLayoutDoc == null), which can take a
                // while on a large file -- once that's done every page is
                // fast, so there's nothing more to warn about even if this
                // particular page still needs its own (quick) extraction.
                if (textLayoutDoc == null && !shownPreparingLargeDocToast) {
                    shownPreparingLargeDocToast = true;
                    Toast.makeText(PdfViewerActivity.this,
                            "Preparing this document for text selection -- large files can take up to " +
                                    "10-15 seconds the first time",
                            Toast.LENGTH_LONG).show();
                }
                ensurePageTextLayoutForPage(pageIndex, new Runnable() {
                    @Override
                    public void run() {
                        textSelectionOverlay.retrySelectionAt(touchX, touchY);
                    }
                });
            }
        });
        copySelectionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = textSelectionOverlay.getSelectedText();
                textSelectionOverlay.clearSelection();
                if (text == null || text.trim().isEmpty()) {
                    Toast.makeText(PdfViewerActivity.this, "Nothing to copy", Toast.LENGTH_SHORT).show();
                    return;
                }
                android.content.ClipboardManager clipboard =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Selected text", text));
                Toast.makeText(PdfViewerActivity.this, "Copied", Toast.LENGTH_SHORT).show();
            }
        });
        highlightSelectionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
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
        redactOverlay.setOnRedactAreaListener(new PdfRedactOverlayView.OnRedactAreaListener() {
            @Override
            public void onRedactAreaMarked() {
                pdfView.setSwipeEnabled(true);
                bottomToolStrip.setVisibility(View.VISIBLE);
                confirmAndRedact();
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
                showSignatureDrawDialog();
            }
        });
        findViewById(R.id.pdfToolFillForm).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showFormFillDialog();
            }
        });
        findViewById(R.id.pdfToolRedact).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                enterRedactMode();
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
        ImageButton rotateBtn = findViewById(R.id.pdfRotateBtn);
        markBtn = findViewById(R.id.pdfMarkBtn);
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
            @Override public void onClick(View v) { stepSearchMatch(-1); }
        });
        searchNextBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { stepSearchMatch(1); }
        });

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

        thumbnailExecutor = Executors.newSingleThreadExecutor();

        SharedPreferences viewerPrefs = getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE);
        nightModeEnabled = viewerPrefs.getBoolean("nightMode", false);
        horizontalScrollEnabled = viewerPrefs.getBoolean("horizontalScroll", false);
        twoPageViewEnabled = viewerPrefs.getBoolean("twoPageView", false);

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
                confirmExitAndFinish();
            }
        });
        // Catches the system back gesture/button too, not just this Activity's
        // own back button -- both need to offer saving pending highlights.
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
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

        bookmarkPageBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleCurrentPageBookmark();
            }
        });

        // Tap toggles mark mode on/off (icon turns red while active).
        // Long-press clears any marks already drawn.
        markBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleMarkMode();
            }
        });
        markBtn.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                markOverlay.clearMarks();
                pdfView.setSwipeEnabled(true);
                Toast.makeText(PdfViewerActivity.this, "Marks cleared", Toast.LENGTH_SHORT).show();
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
                        pdfView.setPositionOffset(pdfView.getPositionOffset(), false);
                        isHandlingPageChange = false;
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
                // Warms the very first page right away too -- onPageChanged
                // below only fires on a page *change*, which wouldn't cover
                // sitting on the starting page without ever swiping.
                prefetchPageTextLayout(pdfView.getCurrentPage());

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
            Toast.makeText(this, "Mark mode on — drag to circle a spot (one mark, then mode turns off). Long-press this button to clear.", Toast.LENGTH_SHORT).show();
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
    protected void onPause() {
        super.onPause();
        // Safety net: covers the case where the activity is backgrounded or
        // killed without a fresh onPageChanged firing after the last scroll.
        savePageProgress();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Memory optimization — nothing else here holds native PDFium
        // resources directly (thumbnail rendering below always opens and
        // closes its own short-lived PdfiumCore document), but the
        // background executor itself must be shut down or its thread leaks
        // past the Activity's lifetime.
        if (thumbnailExecutor != null) thumbnailExecutor.shutdownNow();
        if (textLayoutDoc != null) { try { textLayoutDoc.close(); } catch (Exception ignored) { } }
        if (cachedContentCopyFile != null) { try { cachedContentCopyFile.delete(); } catch (Exception ignored) { } }
        zoomScrollIdlePollerStarted = false;
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
                        pdfView.setPositionOffset(pdfView.getPositionOffset(), false);
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
                            Toast.makeText(PdfViewerActivity.this, "Enter a valid page number", Toast.LENGTH_SHORT).show();
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
            Toast.makeText(this, "Bookmark removed", Toast.LENGTH_SHORT).show();
        } else {
            bookmarkedPages.add(page);
            Toast.makeText(this, "Page bookmarked", Toast.LENGTH_SHORT).show();
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
            Toast.makeText(this, "No bookmarked pages yet. Tap the star to bookmark a page.", Toast.LENGTH_SHORT).show();
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

    private void showMoreMenu() {
        LinearLayout rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(8);
        rows.setPadding(pad, dp(4), pad, dp(4));

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
    private void addMoreMenuRow(LinearLayout container, final AlertDialog dialog, int iconRes,
            String label, String stateText, final Runnable action) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setClickable(true);
        row.setFocusable(true);
        TypedValue outValue = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, outValue, true);
        row.setBackgroundResource(outValue.resourceId);
        int padV = dp(12), padH = dp(8);
        row.setPadding(padH, padV, padH, padV);

        ImageView icon = new ImageView(this);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(22), dp(22));
        iconParams.setMarginEnd(dp(16));
        icon.setLayoutParams(iconParams);
        icon.setImageResource(iconRes);
        icon.setColorFilter(COLOR_INACTIVE, PorterDuff.Mode.SRC_IN);
        row.addView(icon);

        TextView labelView = new TextView(this);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        labelView.setLayoutParams(labelParams);
        labelView.setText(label);
        labelView.setTextColor(COLOR_INACTIVE);
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        row.addView(labelView);

        if (stateText != null) {
            TextView stateView = new TextView(this);
            stateView.setText(stateText);
            stateView.setTextColor(Color.parseColor("#8A8FB0"));
            stateView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
            row.addView(stateView);
        }

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                action.run();
            }
        });

        container.addView(row);
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
            Toast.makeText(this, "Nothing to export", Toast.LENGTH_SHORT).show();
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
                Toast.makeText(this, "Could not read document", Toast.LENGTH_SHORT).show();
                return;
            }

            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, exportName);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

            Uri dest = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) {
                Toast.makeText(this, "Could not create file in Downloads", Toast.LENGTH_SHORT).show();
                return;
            }

            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) {
                Toast.makeText(this, "Could not write to Downloads", Toast.LENGTH_SHORT).show();
                return;
            }
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
            out.flush();
            out.close();

            Toast.makeText(this, "Saved to Downloads: " + exportName, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
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
                    Toast.makeText(PdfViewerActivity.this, "Could not extract text for this page", Toast.LENGTH_SHORT).show();
                    return;
                }
                String text = pageTextsCache.get(page);
                if (text == null || text.trim().isEmpty()) {
                    Toast.makeText(PdfViewerActivity.this, "No text found on this page", Toast.LENGTH_SHORT).show();
                    return;
                }
                android.content.ClipboardManager clipboard =
                        (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                android.content.ClipData clip = android.content.ClipData.newPlainText("Page " + (page + 1) + " text", text);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(PdfViewerActivity.this, "Page " + (page + 1) + " text copied", Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ============================================================
    // SEARCH TEXT (page-level: jumps to the matching page, no on-page
    // highlight box -- see pageTextsCache comment above for why)
    // ============================================================

    private void showSearchDialog() {
        if (lastKnownPageCount <= 0) return;
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setHint("Search text in document");
        input.setTextColor(COLOR_INACTIVE);
        input.setHintTextColor(Color.parseColor("#94A3B8"));
        int pad = dp(20);
        input.setPadding(pad, dp(12), pad, dp(12));

        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Search Text")
                .setView(input)
                .setPositiveButton("Search", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        performSearch(input.getText().toString());
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
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

    private PDDocument openPdDocumentForExtraction() throws Exception {
        return PDDocument.load(resolveLocalFileForExtraction());
    }

    // Extracts every page's text once (background thread -- PDFBox parsing
    // is too slow for the main thread on anything but tiny documents) and
    // caches it, then runs onReady on the main thread. Safe to call
    // repeatedly -- later calls just reuse the cache.
    private void ensurePageTextsExtracted(final Runnable onReady) {
        if (pageTextsCache != null) { onReady.run(); return; }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                List<String> texts = new ArrayList<>();
                PDDocument doc = null;
                try {
                    doc = openPdDocumentForExtraction();
                    int pageCount = doc.getNumberOfPages();
                    for (int i = 1; i <= pageCount; i++) {
                        PDFTextStripper stripper = new PDFTextStripper();
                        stripper.setStartPage(i);
                        stripper.setEndPage(i);
                        String text = stripper.getText(doc);
                        // Same "no text objects -> scanned/image-only page"
                        // signal as ensurePageTextLayoutForPage's own OCR
                        // fallback (see that method's comment) -- without
                        // this, Search/Copy Page Text silently found nothing
                        // on a scanned PDF even though selection/highlight
                        // already worked on it via OCR.
                        if (text == null || text.trim().isEmpty()) {
                            PDPage page = doc.getPage(i - 1);
                            PDRectangle box = page.getMediaBox();
                            int rotation = page.getRotation();
                            boolean swapped = rotation == 90 || rotation == 270;
                            float w = swapped ? box.getHeight() : box.getWidth();
                            float h = swapped ? box.getWidth() : box.getHeight();
                            text = ocrPageTextFallback(i - 1, w, h);
                        }
                        texts.add(text == null ? "" : text);
                    }
                } catch (Exception e) {
                    // Leave whatever was extracted before the failure -- a
                    // partial/empty cache just means "no matches" rather
                    // than crashing the search.
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                pageTextsCache = texts;
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
            onReady.run();
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
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
                                    layout.chars.add(new CharBox(
                                            tp.getUnicode(),
                                            tp.getXDirAdj(),
                                            tp.getYDirAdj(),
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
                        if (layout.chars.isEmpty()) {
                            runOcrFallback(layout, pageIndex);
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
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    if (textLayoutDoc == null) {
                        textLayoutDoc = openPdDocumentForExtraction();
                    }
                } catch (Exception e) {
                    // Leave textLayoutDoc null -- the next real
                    // ensurePageTextLayoutForPage() call will just retry the
                    // open itself and surface the failure there instead.
                }
            }
        });
    }

    private void prefetchPageTextLayout(int page) {
        if (pageTextLayoutCache == null || page < 0 || page >= pageTextLayoutCache.size()) return;
        if (pageTextLayoutCache.get(page) != null) return;
        ensurePageTextLayoutForPage(page, NO_OP);
    }

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
        ensureAttachmentsExtracted(new Runnable() {
            @Override
            public void run() {
                if (attachmentsCache == null || attachmentsCache.isEmpty()) {
                    Toast.makeText(PdfViewerActivity.this, "No attachments in this document", Toast.LENGTH_SHORT).show();
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
                Toast.makeText(this, "Could not create file in Downloads", Toast.LENGTH_SHORT).show();
                return;
            }
            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) {
                Toast.makeText(this, "Could not write to Downloads", Toast.LENGTH_SHORT).show();
                return;
            }
            out.write(attachment.data);
            out.flush();
            out.close();
            Toast.makeText(this, "Saved to Downloads: " + attachment.name, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Save failed: " + e.getMessage(), Toast.LENGTH_LONG).show();
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
            Toast.makeText(this, "Nothing selected", Toast.LENGTH_SHORT).show();
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
        Toast.makeText(this, "Saving highlighted copy…", Toast.LENGTH_SHORT).show();

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
                        resultMessage = saveDocumentCopyToDownloads(doc, baseName + "_highlighted.pdf");
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
                        Toast.makeText(PdfViewerActivity.this, msg, Toast.LENGTH_LONG).show();
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
    private String saveDocumentCopyToDownloads(PDDocument doc, String outName) {
        try {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, outName);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);

            Uri dest = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (dest == null) return "Could not create file in Downloads";

            java.io.OutputStream out = getContentResolver().openOutputStream(dest);
            if (out == null) return "Could not write to Downloads";
            try {
                doc.save(out);
            } finally {
                out.close();
            }
            return "Saved to Downloads: " + outName;
        } catch (Exception e) {
            return "Save failed: " + e.getMessage();
        }
    }

    // ============================================================
    // SIGNATURE -- draw a signature, drag/pinch-resize it into place on the
    // current page, then stamp it into a new saved copy of the PDF (same
    // always-save-a-copy reasoning as Highlight: never risk the person's
    // original file, and a content:// source often can't be overwritten in
    // place anyway).
    // ============================================================

    private void showSignatureDrawDialog() {
        final SignatureDrawView drawView = new SignatureDrawView(this, null);
        drawView.setBackgroundColor(Color.WHITE);
        FrameLayout container = new FrameLayout(this);
        int pad = dp(16);
        container.setPadding(pad, pad, pad, pad);
        container.addView(drawView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220)));

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
                            Toast.makeText(PdfViewerActivity.this, "Draw a signature first", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        dialog.dismiss();
                        enterSignaturePlacementMode(bmp);
                    }
                });
            }
        });
        dialog.show();
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
            Toast.makeText(this, "Could not place signature", Toast.LENGTH_SHORT).show();
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        Toast.makeText(this, "Saving signed copy…", Toast.LENGTH_SHORT).show();

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
                        resultMessage = saveDocumentCopyToDownloads(doc, baseName + "_signed.pdf");
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
                        Toast.makeText(PdfViewerActivity.this, msg, Toast.LENGTH_LONG).show();
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
                            Toast.makeText(PdfViewerActivity.this, "No fillable fields in this document", Toast.LENGTH_SHORT).show();
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
        Toast.makeText(this, "Saving filled copy…", Toast.LENGTH_SHORT).show();

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
                        resultMessage = saveDocumentCopyToDownloads(doc, baseName + "_filled.pdf");
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
                        Toast.makeText(PdfViewerActivity.this, msg, Toast.LENGTH_LONG).show();
                    }
                });
            }
        });
    }

    // ============================================================
    // REDACT AREA -- permanently removes the underlying content in a marked
    // rectangle, not just draws a black box over it. A black box ALONE would
    // be a fake redaction: the original text/image data is still sitting in
    // the page's content stream underneath, recoverable by copy-paste, text
    // search, or just deleting the box in an editor -- actively dangerous if
    // someone relies on it to actually remove sensitive information. So this
    // instead flattens the WHOLE marked page to a single raster image (with
    // the redacted rectangle painted solid black before flattening) and
    // replaces the page's entire content stream with just that image --
    // nothing from the original vector text/content survives on that page.
    // Trade-off, and it's a real one: that page loses selectable/searchable
    // text and gets noticeably heavier. That's the honest cost of the
    // content actually being gone rather than just hidden.
    //
    // SCOPE LIMIT: only pages with /Rotate 0 (the common case) are
    // supported. Placing the flattened (as-displayed) bitmap back into a
    // rotated page's raw (pre-rotation) content space needs a rotation-
    // compensating content-stream transform; getting that exactly right
    // needs verifying against an actual rotated PDF, which wasn't available
    // to test against here. Refusing outright on a rotated page is the safe
    // choice -- an explicit "not supported" beats a redaction that might
    // silently land in the wrong place while looking like it worked.
    // ============================================================

    private void enterRedactMode() {
        pdfView.setSwipeEnabled(false);
        redactOverlay.setModeEnabled(true);
        bottomToolStrip.setVisibility(View.GONE);
        Toast.makeText(this, "Drag to mark an area to redact", Toast.LENGTH_SHORT).show();
    }

    private void confirmAndRedact() {
        new AlertDialog.Builder(this, R.style.PdfDialogTheme)
                .setTitle("Redact this area?")
                .setMessage("This permanently removes the underlying content in the marked area on this page " +
                        "(not just a black box over it) in a new saved copy. The original file is never changed.")
                .setPositiveButton("Redact", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        redactSelectedAreaAndSave();
                    }
                })
                .setNegativeButton("Cancel", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        redactOverlay.clearConfirmedRect();
                    }
                })
                .show();
    }

    private void redactSelectedAreaAndSave() {
        final float[] area = redactOverlay.getNormalizedRedactArea();
        // Turns the temporary preview box into a persistent, fully opaque
        // on-screen marker immediately -- same reasoning as Highlight's
        // commitHighlight(): the background save below is for a durable
        // copy, not what makes the redaction visible right now.
        redactOverlay.commitRedaction();
        if (area == null) {
            Toast.makeText(this, "Could not mark that area", Toast.LENGTH_SHORT).show();
            return;
        }
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        Toast.makeText(this, "Redacting and saving copy…", Toast.LENGTH_SHORT).show();

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
                        resultMessage = "Nothing to redact";
                    } else {
                        PDPage pdPage = doc.getPage(page);
                        int rotation = pdPage.getRotation();
                        if (rotation != 0) {
                            resultMessage = "This page is rotated -- redaction isn't supported on rotated pages yet";
                        } else {
                            PDRectangle box = pdPage.getMediaBox();
                            float pageWidthPts = box.getWidth();
                            float pageHeightPts = box.getHeight();

                            // 2 pixels per PDF point -- decent quality without
                            // an excessive file size for a single flattened page.
                            float renderScale = 2f;
                            int outW = Math.max(1, Math.round(pageWidthPts * renderScale));
                            int outH = Math.max(1, Math.round(pageHeightPts * renderScale));

                            Bitmap flattened = renderPageBitmapForFlatten(page, outW, outH);
                            if (flattened == null) {
                                resultMessage = "Could not render this page to redact it";
                            } else {
                                Canvas canvas = new Canvas(flattened);
                                Paint blackPaint = new Paint();
                                blackPaint.setColor(Color.BLACK);
                                blackPaint.setStyle(Paint.Style.FILL);
                                canvas.drawRect(
                                        fracLeft * outW,
                                        fracTop * outH,
                                        (fracLeft + fracW) * outW,
                                        (fracTop + fracH) * outH,
                                        blackPaint);

                                java.io.ByteArrayOutputStream pngOut = new java.io.ByteArrayOutputStream();
                                flattened.compress(Bitmap.CompressFormat.PNG, 100, pngOut);
                                flattened.recycle();

                                PDImageXObject image = PDImageXObject.createFromByteArray(doc, pngOut.toByteArray(), "redacted-page");
                                // OVERWRITE, not APPEND -- this discards the
                                // page's existing content stream entirely
                                // (that's the whole point: nothing from the
                                // original content should survive) rather
                                // than drawing the image on top of it.
                                PDPageContentStream cs = new PDPageContentStream(doc, pdPage,
                                        PDPageContentStream.AppendMode.OVERWRITE, true, true);
                                try {
                                    cs.drawImage(image, box.getLowerLeftX(), box.getLowerLeftY(), pageWidthPts, pageHeightPts);
                                } finally {
                                    cs.close();
                                }
                                // The page's own /Resources (fonts, other
                                // XObjects, etc.) are now unreferenced by the
                                // new content stream, but PDPageContentStream
                                // in OVERWRITE mode replaces the resources
                                // dictionary for us, so nothing from the old
                                // page's resource set carries over either.

                                String baseName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "document.pdf";
                                if (baseName.toLowerCase().endsWith(".pdf")) {
                                    baseName = baseName.substring(0, baseName.length() - 4);
                                }
                                resultMessage = saveDocumentCopyToDownloads(doc, baseName + "_redacted.pdf");
                            }
                        }
                    }
                } catch (OutOfMemoryError e) {
                    resultMessage = "Not enough memory to redact this page (it's a large/complex PDF)";
                } catch (Exception e) {
                    resultMessage = "Redaction failed: " + e.getMessage();
                } finally {
                    if (doc != null) { try { doc.close(); } catch (Exception ignored) { } }
                }
                final String msg = resultMessage;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(PdfViewerActivity.this, msg, Toast.LENGTH_LONG).show();
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
    private Bitmap renderPageBitmapForFlatten(int pageIndex, int outW, int outH) {
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
            Bitmap bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
            core.renderPageBitmap(doc, bitmap, pageIndex, 0, 0, outW, outH);
            return bitmap;
        } catch (Exception e) {
            return null;
        } finally {
            try { if (doc != null && core != null) core.closeDocument(doc); } catch (Exception ignored) { }
            try { if (pfd != null) pfd.close(); } catch (Exception ignored) { }
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
    private void runOcrFallback(PageTextLayout layout, int pageIndex) {
        if (layout.pageWidthPts <= 0 || layout.pageHeightPts <= 0) return;
        // ~2.5px per PDF point -- roughly 180 DPI equivalent, a reasonable
        // balance between OCR accuracy and how long a single page takes.
        final float renderScale = 2.5f;
        int outW = Math.max(1, Math.round(layout.pageWidthPts * renderScale));
        int outH = Math.max(1, Math.round(layout.pageHeightPts * renderScale));
        Bitmap bitmap = renderPageBitmapForFlatten(pageIndex, outW, outH);
        if (bitmap == null) return;
        try {
            com.google.mlkit.vision.text.TextRecognizer recognizer =
                    com.google.mlkit.vision.text.TextRecognition.getClient(
                            com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS);
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
            com.google.mlkit.vision.text.TextRecognizer recognizer =
                    com.google.mlkit.vision.text.TextRecognition.getClient(
                            com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS);
            com.google.mlkit.vision.common.InputImage image =
                    com.google.mlkit.vision.common.InputImage.fromBitmap(bitmap, 0);
            com.google.mlkit.vision.text.Text result =
                    com.google.android.gms.tasks.Tasks.await(recognizer.process(image));
            String text = result.getText();
            return text == null ? "" : text;
        } catch (Exception e) {
            return "";
        } finally {
            bitmap.recycle();
        }
    }

    private void performSearch(String rawQuery) {
        final String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.isEmpty()) return;

        // Show progress in the bar itself (same "tab" the results land in)
        // instead of a Toast that vanishes on its own timer. Prev/next
        // disabled meanwhile -- there's no result set to step through yet.
        currentMatchPages = null;
        searchBar.setVisibility(View.VISIBLE);
        searchLabel.setText("Searching…");
        searchPrevBtn.setEnabled(false);
        searchNextBtn.setEnabled(false);
        searchPrevBtn.setAlpha(0.4f);
        searchNextBtn.setAlpha(0.4f);

        ensurePageTextsExtracted(new Runnable() {
            @Override
            public void run() {
                final List<Integer> matchPages = new ArrayList<>();
                String queryLower = query.toLowerCase();
                for (int i = 0; i < pageTextsCache.size(); i++) {
                    if (pageTextsCache.get(i).toLowerCase().contains(queryLower)) {
                        matchPages.add(i);
                    }
                }
                if (matchPages.isEmpty()) {
                    searchLabel.setText("No matches");
                    return;
                }
                currentMatchPages = matchPages;
                currentMatchIndex = 0;
                searchPrevBtn.setEnabled(true);
                searchNextBtn.setEnabled(true);
                searchPrevBtn.setAlpha(1f);
                searchNextBtn.setAlpha(1f);
                jumpToCurrentMatch();
            }
        });
    }

    // Adobe-Reader-style: steps currentMatchIndex by delta (wrapping around
    // both ends) and jumps straight to that match's page -- no list to
    // reopen, the bar itself is the only UI, and it stays out of the way of
    // the page underneath.
    private void stepSearchMatch(int delta) {
        if (currentMatchPages == null || currentMatchPages.isEmpty()) return;
        int size = currentMatchPages.size();
        currentMatchIndex = ((currentMatchIndex + delta) % size + size) % size;
        jumpToCurrentMatch();
    }

    private void jumpToCurrentMatch() {
        if (currentMatchPages == null || currentMatchPages.isEmpty()) return;
        int page = currentMatchPages.get(currentMatchIndex);
        pdfView.jumpTo(page, true);
        searchLabel.setText((currentMatchIndex + 1) + " of " + currentMatchPages.size());
    }

    private void closeSearchBar() {
        searchBar.setVisibility(View.GONE);
        currentMatchPages = null;
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
            Toast.makeText(this, "Nothing to print", Toast.LENGTH_SHORT).show();
            return;
        }
        android.print.PrintManager printManager =
                (android.print.PrintManager) getSystemService(android.content.Context.PRINT_SERVICE);
        if (printManager == null) {
            Toast.makeText(this, "Printing isn't available on this device", Toast.LENGTH_SHORT).show();
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
        Toast.makeText(this, nightModeEnabled ? "Night mode on" : "Night mode off", Toast.LENGTH_SHORT).show();
    }

    private void toggleScrollDirection() {
        horizontalScrollEnabled = !horizontalScrollEnabled;
        getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE).edit().putBoolean("horizontalScroll", horizontalScrollEnabled).apply();
        loadPdf(pdfView.getCurrentPage(), pdfView.getZoom());
        Toast.makeText(this, horizontalScrollEnabled ? "Horizontal scrolling" : "Vertical scrolling", Toast.LENGTH_SHORT).show();
    }

    // Side-by-side spread: forces horizontal layout (see loadPdf()'s
    // effectiveHorizontal) and zooms out to TWO_PAGE_ZOOM so two consecutive
    // pages fit the screen width at once. Turning it back off restores
    // whatever zoom/scroll-direction preference was active before.
    private void toggleTwoPageView() {
        twoPageViewEnabled = !twoPageViewEnabled;
        getSharedPreferences(VIEWER_PREFS, MODE_PRIVATE).edit().putBoolean("twoPageView", twoPageViewEnabled).apply();
        loadPdf(pdfView.getCurrentPage(), twoPageViewEnabled ? TWO_PAGE_ZOOM_SENTINEL : -1f);
        Toast.makeText(this, twoPageViewEnabled ? "Two-page view" : "Single-page view", Toast.LENGTH_SHORT).show();
    }

    // ============================================================
    // FULL SCREEN MODE
    // ============================================================

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
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            if (toolbar != null) toolbar.setVisibility(View.VISIBLE);
            if (secondaryBar != null) secondaryBar.setVisibility(View.VISIBLE);
            if (bottomToolStrip != null) bottomToolStrip.setVisibility(View.VISIBLE);
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
            renderThumbnailAsync(pageIndex, cellSize, iv);
        }
    }

    private void renderThumbnailAsync(final int pageIndex, final int targetSize, final ImageView target) {
        if (thumbnailExecutor == null || thumbnailExecutor.isShutdown()) return;
        thumbnailExecutor.execute(new Runnable() {
            @Override
            public void run() {
                Bitmap bmp = renderSinglePageThumbnail(pageIndex, targetSize);
                if (bmp == null) return;
                final Bitmap finalBmp = bmp;
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
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