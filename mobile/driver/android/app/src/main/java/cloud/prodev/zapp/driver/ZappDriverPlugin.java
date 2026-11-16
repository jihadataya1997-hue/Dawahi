package cloud.prodev.zapp.driver;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.location.LocationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * جسر بين واجهة تطبيق العامل (الويب) والخدمة الأصلية اللي بتشتغل بالخلفية:
 * start / stop / silence / status / ensurePermissions / batteryExemption
 */
@CapacitorPlugin(
    name = "ZappDriver",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class ZappDriverPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token");
        String base = call.getString("base", "https://zapp.prodev.cloud");
        if (token == null || token.isEmpty()) {
            call.reject("token required");
            return;
        }
        Context ctx = getContext();
        DriverService.saveConfig(ctx, token, base, true);
        Intent i = new Intent(ctx, DriverService.class);
        ContextCompat.startForegroundService(ctx, i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        DriverService.saveConfig(ctx, null, null, false);
        ctx.stopService(new Intent(ctx, DriverService.class));
        call.resolve();
    }

    @PluginMethod
    public void silence(PluginCall call) {
        DriverService.silence(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("running", DriverService.running);
        r.put("location", getPermissionState("location") == PermissionState.GRANTED);
        // الإشعارات: الإذن + إنها مو مسكّرة من إعدادات التطبيق
        r.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
            && (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED));
        // الموقع مفتوح بالموبايل كله (الـGPS)
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        r.put("gps", lm == null || LocationManagerCompat.isLocationEnabled(lm));
        r.put("brand", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("v2", true);
        r.put("batteryExempt", isBatteryExempt());
        r.put("fullScreen", canFullScreen());
        call.resolve(r);
    }

    /** يطلب إذن الموقع والإشعارات مرة وحدة */
    @PluginMethod
    public void ensurePermissions(PluginCall call) {
        boolean needLoc = getPermissionState("location") != PermissionState.GRANTED;
        boolean needNotif = Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED;
        if (needLoc && needNotif) requestPermissionForAliases(new String[] { "location", "notifications" }, call, "permsDone");
        else if (needLoc) requestPermissionForAlias("location", call, "permsDone");
        else if (needNotif) requestPermissionForAlias("notifications", call, "permsDone");
        else permsDone(call);
    }

    @PermissionCallback
    private void permsDone(PluginCall call) {
        status(call);
    }

    private boolean canFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return true;
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.canUseFullScreenIntent();
    }

    /** أندرويد 14+: إذن "شاشة كاملة" حتى يطلع الطلب فوق شاشة القفل متل المكالمة */
    @PluginMethod
    public void fullScreenSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34 && !canFullScreen()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private void open(Intent i) throws Exception {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }

    private Intent appDetails() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        return i;
    }

    /** صفحة إعدادات التطبيق (الأذونات) — لما يكون رافض الإذن وأندرويد ما عاد يسأل */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try { open(appDetails()); } catch (Exception ignored) {}
        call.resolve();
    }

    /** صفحة إشعارات التطبيق مباشرة */
    @PluginMethod
    public void notificationSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                open(i);
            } else open(appDetails());
        } catch (Exception e) {
            try { open(appDetails()); } catch (Exception ignored) {}
        }
        call.resolve();
    }

    /** تشغيل الموقع (GPS) بالموبايل */
    @PluginMethod
    public void gpsSettings(PluginCall call) {
        try { open(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)); } catch (Exception ignored) {}
        call.resolve();
    }

    /** شاومي وهواوي وأوبو وفيفو وغيرن: صفحة "التشغيل التلقائي" الخاصة بالشركة */
    @PluginMethod
    public void autostartSettings(PluginCall call) {
        String[][] targets = {
            { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
            { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
            { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
            { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
            { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
            { "com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity" },
            { "com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity" },
        };
        boolean opened = false;
        for (String[] t : targets) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(t[0], t[1]));
                open(i);
                opened = true;
                break;
            } catch (Exception ignored) {}
        }
        if (!opened) {
            try { open(appDetails()); } catch (Exception ignored) {}
        }
        JSObject r = new JSObject();
        r.put("opened", opened);
        call.resolve(r);
    }

    private boolean isBatteryExempt() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    /** يطلب من النظام ما يوقّف التطبيق لتوفير البطارية (حتى توصل الطلبات والموبايل مقفول) */
    @PluginMethod
    public void batteryExemption(PluginCall call) {
        if (!isBatteryExempt()) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) {
                try {
                    Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception ignored) {}
            }
        }
        call.resolve();
    }
}
