package com.docman;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

// The one-time "DOCMAN Pro" unlock, via Google Play Billing.
//
// Whether someone owns Pro is Google's answer, not ours. Every check asks
// queryPurchasesAsync(), which reads the Google Play Store app's own on-device
// cache -- so it works offline for anyone Play already knows about.
//
// The one thing kept locally is the LAST answer Google gave, and it is used
// only when Google Play cannot be reached at all (Play Store disabled, no Play
// services). It is never trusted over a real answer: every successful query
// overwrites it, so a refund clears it the next time Play is reachable. Without
// it, a paying customer on a phone where Play is temporarily unavailable would
// lose Pro every time the app restarted.
//
// restore() is not optional. Anyone reinstalling, or signing in on a new
// phone, must get their purchase back without contacting support -- Play
// reviewers check for this.
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin implements PurchasesUpdatedListener {

    // Must match the product ID created in Play Console exactly.
    public static final String PRODUCT_ID = "docman_pro";

    private static final String PREFS = "docman_billing";
    private static final String KEY_LAST_KNOWN = "last_known_purchased";

    private BillingClient billingClient;
    private ProductDetails cachedProduct;
    private boolean connected = false;
    private boolean lastKnownPurchased = false;

    // startConnection() refuses a second call while the first is still in
    // progress ("already in the process of connecting"). At launch load() and
    // the web layer's first isPurchased() arrive together, so without this
    // queue the second one saw "not connected" and answered with the stale
    // fallback -- a paying user who had just reinstalled showed as free until
    // the next restart. Everything asked for while connecting waits here.
    private boolean connecting = false;
    private final List<Runnable> waitingForConnection = new ArrayList<>();

    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        lastKnownPurchased = getContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_LAST_KNOWN, false);

        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        connect(null);
    }

    // Records a REAL answer from Google Play. Only ever called with a result
    // Play actually returned -- never with a guess.
    private void rememberPurchased(boolean owned) {
        lastKnownPurchased = owned;
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_LAST_KNOWN, owned).apply();
    }

    private void connect(final Runnable onReady) {
        boolean runNow = false;
        boolean startNow = false;
        synchronized (this) {
            if (billingClient.isReady()) {
                connected = true;
                runNow = true;
            } else {
                if (onReady != null) waitingForConnection.add(onReady);
                if (!connecting) {
                    connecting = true;
                    startNow = true;
                }
            }
        }
        if (runNow) {
            if (onReady != null) onReady.run();
            return;
        }
        if (!startNow) return;

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                finishConnecting(result.getResponseCode() == BillingClient.BillingResponseCode.OK);
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Also releases anything still waiting, so no call is left
                // unanswered; each one sees !connected and falls back.
                finishConnecting(false);
            }
        });
    }

    private void finishConnecting(boolean ok) {
        List<Runnable> ready;
        synchronized (this) {
            connected = ok;
            connecting = false;
            ready = new ArrayList<>(waitingForConnection);
            waitingForConnection.clear();
        }
        for (Runnable r : ready) r.run();
    }

    // Whether this user owns the unlock.
    @PluginMethod
    public void isPurchased(final PluginCall call) {
        connect(new Runnable() {
            @Override public void run() {
                if (!connected) {
                    // Play unreachable. Fall back to the last real answer --
                    // never downgrade a paying user because Play is unavailable.
                    JSObject ret = new JSObject();
                    ret.put("purchased", lastKnownPurchased);
                    ret.put("stale", true);
                    call.resolve(ret);
                    return;
                }
                queryOwned(call, false);
            }
        });
    }

    // Same query, but surfaced as an explicit user action so the UI can say
    // "restored" / "nothing to restore".
    @PluginMethod
    public void restore(final PluginCall call) {
        connect(new Runnable() {
            @Override public void run() {
                if (!connected) {
                    call.reject("Could not reach Google Play. Check your connection and try again.");
                    return;
                }
                queryOwned(call, true);
            }
        });
    }

    private void queryOwned(final PluginCall call, final boolean isRestore) {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP).build(),
                (result, purchases) -> {
                    boolean owned = false;
                    boolean pending = false;
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                            && purchases != null) {
                        for (Purchase p : purchases) {
                            if (!p.getProducts().contains(PRODUCT_ID)) continue;
                            if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                owned = true;
                                acknowledgeIfNeeded(p);
                            } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                                pending = true;
                            }
                        }
                        rememberPurchased(owned);
                    } else {
                        owned = lastKnownPurchased;
                    }
                    JSObject ret = new JSObject();
                    ret.put("purchased", owned);
                    ret.put("pending", pending && !owned);
                    ret.put("restored", isRestore && owned);
                    call.resolve(ret);
                });
    }

    // Price and title in the user's own currency. Never hard-code a price in
    // the UI -- Play localises it per country and we must show what they pay.
    @PluginMethod
    public void getProduct(final PluginCall call) {
        connect(new Runnable() {
            @Override public void run() {
                if (!connected) { call.reject("Google Play is unavailable right now."); return; }

                List<QueryProductDetailsParams.Product> products = new ArrayList<>();
                products.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build());

                billingClient.queryProductDetailsAsync(
                        QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                        (result, queryResult) -> {
                            // Billing 8 wraps the list in QueryProductDetailsResult.
                            List<ProductDetails> details = queryResult == null
                                    ? null : queryResult.getProductDetailsList();
                            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                                    || details == null || details.isEmpty()) {
                                call.reject("Product not available. It may not be published in Play Console yet.");
                                return;
                            }
                            cachedProduct = details.get(0);
                            ProductDetails.OneTimePurchaseOfferDetails offer =
                                    cachedProduct.getOneTimePurchaseOfferDetails();
                            JSObject ret = new JSObject();
                            ret.put("title", cachedProduct.getTitle());
                            ret.put("description", cachedProduct.getDescription());
                            ret.put("price", offer != null ? offer.getFormattedPrice() : "");
                            call.resolve(ret);
                        });
            }
        });
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) { call.reject("No activity available."); return; }

        connect(new Runnable() {
            @Override public void run() {
                if (!connected) { call.reject("Google Play is unavailable right now."); return; }
                if (cachedProduct == null) {
                    call.reject("Product details not loaded. Open the Pro screen again.");
                    return;
                }
                List<BillingFlowParams.ProductDetailsParams> list = new ArrayList<>();
                list.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(cachedProduct).build());

                pendingPurchaseCall = call;
                call.setKeepAlive(true); // resolved later, in onPurchasesUpdated
                billingClient.launchBillingFlow(activity,
                        BillingFlowParams.newBuilder().setProductDetailsParamsList(list).build());
            }
        });
    }

    // Called for purchases started from the Pro screen AND for ones Google
    // completes on its own later -- e.g. a cash or bank-transfer payment that
    // was pending and has now cleared while the app is open.
    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;

        int code = result.getResponseCode();
        boolean owned = false;
        boolean pending = false;

        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(PRODUCT_ID)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    owned = true;
                    acknowledgeIfNeeded(p);
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    pending = true;
                }
            }
            if (owned) rememberPurchased(true);
        }

        if (call == null) {
            // Nobody is waiting on a purchase call: tell the web layer directly.
            if (owned) {
                JSObject data = new JSObject();
                data.put("purchased", true);
                notifyListeners("purchaseUpdated", data, true);
            }
            return;
        }
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject ret = new JSObject();
            ret.put("purchased", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // Bought before (another phone, a reinstall): unlock, never charge twice.
            rememberPurchased(true);
            JSObject ret = new JSObject();
            ret.put("purchased", true);
            ret.put("cancelled", false);
            call.resolve(ret);
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK) {
            call.reject("Purchase failed (" + code + "). Nothing has been charged.");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("purchased", owned);
        ret.put("pending", pending && !owned);
        ret.put("cancelled", false);
        call.resolve(ret);
    }

    // Google automatically refunds any purchase left unacknowledged for three
    // days, so this is not optional bookkeeping -- skipping it means the user
    // pays, gets the feature, then silently loses both. Pending purchases are
    // never acknowledged; they are picked up once they become PURCHASED.
    private void acknowledgeIfNeeded(Purchase p) {
        if (p.isAcknowledged()) return;
        billingClient.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(p.getPurchaseToken()).build(),
                billingResult -> { /* best effort; retried on next launch via queryOwned */ });
    }
}
