package cloud.prodev.zapp.driver;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * خدمة عامل التوصيل بالخلفية (شغّالة طالما العامل "متاح"):
 *  - بتسأل السيرفر كل 4 ثواني إذا في طلب معروض عليه
 *  - إذا إجا طلب والتطبيق مسكّر أو بالخلفية: بترنّ الموبايل متل المكالمة وبتهزّ وبتطلع إشعار بيفتح التطبيق
 *  - بترسل موقعه للإدارة كل 20 ثانية (للخريطة الحية)
 */
public class DriverService extends Service {
    private static final String TAG = "ZappDriver";
    private static final String PREFS = "zapp_driver";
    private static final String CH_ONLINE = "zapp_online";
    private static final String CH_OFFERS = "zapp_offers_ring";
    private static final int ID_ONLINE = 1001;
    private static final int ID_OFFER = 1002;
    private static final long POLL_SEC = 4;
    private static final long LOCATION_SEC = 20;
    private static final long RING_MAX_MS = 60_000;

    static volatile boolean running = false;
    static volatile boolean appVisible = false;
    private static DriverService instance;

    private ScheduledExecutorService exec;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> seenOffers = new HashSet<>();
    private PowerManager.WakeLock wakeLock;
    private MediaPlayer player;
    private Vibrator vibrator;
    private LocationManager locationManager;
    private volatile Location lastLocation;
    private long lastLocationSent = 0;
    private int failures = 0;
    private int ticks = 0;

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location l) {
            Location prev = lastLocation;
            // منفضّل القراءة الأدق، أو أي قراءة أحدث بـ 30 ثانية
            if (prev == null || l.getAccuracy() <= prev.getAccuracy() || l.getTime() - prev.getTime() > 30_000) lastLocation = l;
        }
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
        @Override public void onStatusChanged(String p, int s, android.os.Bundle b) {}
    };

    /* ───────── الإعدادات المحفوظة (حتى ترجع الخدمة لحالها إذا النظام سكّرها) ───────── */
    static void saveConfig(Context ctx, String token, String base, boolean enabled) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit();
        if (token != null) e.putString("token", token);
        if (base != null) e.putString("base", base);
        e.putBoolean("enabled", enabled);
        if (!enabled) e.remove("token");
        e.apply();
    }

    private String pref(String k) {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(k, null);
    }

    static void silence(Context ctx) {
        DriverService s = instance;
        if (s != null) s.main.post(s::stopRing);
        else {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ID_OFFER);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannels();
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean enabled = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("enabled", false);
        String token = pref("token");
        startInForeground();
        if (!enabled || token == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            acquireWakeLock();
            startLocation();
            exec = Executors.newSingleThreadScheduledExecutor();
            exec.scheduleWithFixedDelay(this::tick, 0, POLL_SEC, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    private void startInForeground() {
        Notification n = onlineNotification();
        boolean hasLoc = hasLocationPermission();
        int type = 0;
        if (Build.VERSION.SDK_INT >= 29) {
            type = hasLoc ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        }
        try {
            ServiceCompat.startForeground(this, ID_ONLINE, n, type);
        } catch (Exception e) {
            // أندرويد 14+: ما بيسمح بخدمة "موقع" إذا انطلقت من الخلفية → منكمّل بدون الموقع
            Log.w(TAG, "foreground with location failed, falling back", e);
            int fallback = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0;
            ServiceCompat.startForeground(this, ID_ONLINE, n, fallback);
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zapp:driver");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    @SuppressLint("MissingPermission")
    private void startLocation() {
        if (!hasLocationPermission()) return;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) return;
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener, Looper.getMainLooper());
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000, 20, locationListener, Looper.getMainLooper());
        } catch (Exception e) {
            Log.w(TAG, "location updates failed", e);
        }
    }

    /* ───────── الدورة: عروض الطلبات + الموقع ───────── */
    private void tick() {
        String token = pref("token");
        String base = pref("base");
        if (token == null || base == null) {
            main.post(this::stopSelf);
            return;
        }
        try {
            pollOffers(base, token);
            failures = 0;
            // كل دقيقة: إذا صار "غير متاح" (من التطبيق أو تلقائياً بعد تجاهل عروض) منوقف الخدمة
            if (++ticks % 15 == 0) {
                JSONObject me = new JSONObject(request("GET", base + "/api/courier/me", token, null)).optJSONObject("courier");
                if (me != null && !me.optBoolean("online", true)) {
                    saveConfig(this, null, null, false);
                    main.post(this::stopSelf);
                    return;
                }
            }
        } catch (Unauthorized u) {
            // انتهت الجلسة (سجّل خروج أو انحذف حسابه) → منوقف الخدمة
            saveConfig(this, null, null, false);
            main.post(this::stopSelf);
            return;
        } catch (Exception e) {
            failures++;
            if (failures % 10 == 1) Log.w(TAG, "poll failed (" + failures + ")", e);
        }
        long now = System.currentTimeMillis();
        Location l = lastLocation;
        if (l != null && now - lastLocationSent >= LOCATION_SEC * 1000) {
            lastLocationSent = now;
            try {
                JSONObject body = new JSONObject();
                body.put("lat", l.getLatitude());
                body.put("lng", l.getLongitude());
                body.put("accuracy", (double) l.getAccuracy());
                request("POST", base + "/api/courier/location", token, body.toString());
            } catch (Unauthorized u) {
                saveConfig(this, null, null, false);
                main.post(this::stopSelf);
            } catch (Exception ignored) {}
        }
    }

    private void pollOffers(String base, String token) throws Exception {
        String res = request("GET", base + "/api/courier/offers", token, null);
        JSONArray offers = new JSONObject(res).optJSONArray("offers");
        Set<String> current = new HashSet<>();
        JSONObject fresh = null;
        if (offers != null) {
            for (int i = 0; i < offers.length(); i++) {
                JSONObject o = offers.getJSONObject(i);
                String id = o.optString("offerId");
                current.add(id);
                if (!seenOffers.contains(id) && fresh == null) fresh = o;
            }
        }
        seenOffers.clear();
        seenOffers.addAll(current);
        final JSONObject offer = fresh;
        if (offer != null && !appVisible) main.post(() -> ring(offer));
        if (current.isEmpty()) main.post(this::stopRing);
    }

    private static class Unauthorized extends Exception {}

    private String request(String method, String url, String token, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        if (code == 401) {
            c.disconnect();
            throw new Unauthorized();
        }
        if (code == 204) {
            c.disconnect();
            return "{}";
        }
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(code < 400 ? c.getInputStream() : c.getErrorStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        } finally {
            c.disconnect();
        }
        if (code >= 400) throw new Exception("HTTP " + code);
        return sb.toString();
    }

    /* ───────── الرنّة ───────── */
    private void ring(JSONObject offer) {
        JSONObject order = offer.optJSONObject("order");
        String number = order != null ? order.optString("number", "") : "";
        String text = "طلب جديد بانتظارك، افتح التطبيق لتقبله";
        if (order != null) {
            JSONObject d = order.optJSONObject("details");
            if ("gas".equals(order.optString("kind"))) text = "غاز · " + (d != null ? d.optInt("qty", 1) : 1) + " جرة";
            else if (d != null && !d.optString("items").isEmpty()) text = d.optString("items");
            String addr = order.optString("address", "");
            if (!addr.isEmpty()) text += "\n" + addr;
        }
        PendingIntent open = openAppIntent();
        Notification n = new NotificationCompat.Builder(this, CH_OFFERS)
            .setSmallIcon(R.drawable.ic_stat_zapp)
            .setColor(0xFF4B1FE0)
            .setContentTitle("🔔 طلب جديد " + number)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(RING_MAX_MS)
            .build();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID_OFFER, n);

        stopSound();
        try {
            Uri uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            Log.w(TAG, "ringtone failed", e);
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = { 0, 800, 600, 800, 600 };
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else vibrator.vibrate(pattern, 0);
        }
        main.removeCallbacks(autoStop);
        main.postDelayed(autoStop, RING_MAX_MS);
    }

    private final Runnable autoStop = this::stopSound;

    private void stopSound() {
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (vibrator != null) vibrator.cancel();
    }

    private void stopRing() {
        stopSound();
        main.removeCallbacks(autoStop);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_OFFER);
    }

    /* ───────── الإشعارات ───────── */
    private PendingIntent openAppIntent() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification onlineNotification() {
        return new NotificationCompat.Builder(this, CH_ONLINE)
            .setSmallIcon(R.drawable.ic_stat_zapp)
            .setColor(0xFF4B1FE0)
            .setContentTitle("أنت متاح لاستقبال الطلبات")
            .setContentText("بيرنّ الموبايل أول ما يجيك طلب، حتى والتطبيق مسكّر")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openAppIntent())
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel online = new NotificationChannel(CH_ONLINE, "حالة الاتصال", NotificationManager.IMPORTANCE_LOW);
        online.setDescription("إشعار ثابت طالما أنت متاح لاستقبال الطلبات");
        online.setShowBadge(false);
        nm.createNotificationChannel(online);
        NotificationChannel offers = new NotificationChannel(CH_OFFERS, "طلبات جديدة (رنين)", NotificationManager.IMPORTANCE_HIGH);
        offers.setDescription("رنين متل المكالمة لما يجيك طلب جديد");
        offers.setSound(null, null); // الصوت منشغّله نحن بشكل متكرر
        offers.enableVibration(false);
        offers.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        offers.setBypassDnd(true);
        nm.createNotificationChannel(offers);
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        if (exec != null) exec.shutdownNow();
        if (locationManager != null) locationManager.removeUpdates(locationListener);
        stopRing();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
