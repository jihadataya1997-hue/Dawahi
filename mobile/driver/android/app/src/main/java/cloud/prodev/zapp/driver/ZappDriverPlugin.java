package cloud.prodev.zapp.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
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
        r.put("notifications", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        r.put("batteryExempt", isBatteryExempt());
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
