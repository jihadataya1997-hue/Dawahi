package cloud.prodev.zapp.driver;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * أزرار "قبول" و"رفض" على إشعار الرنين: بيرد على العرض مباشرة بدون ما يفتح العامل التطبيق
 */
public class OfferActionReceiver extends BroadcastReceiver {
    static final String ACCEPT = "cloud.prodev.zapp.driver.ACCEPT";
    static final String DECLINE = "cloud.prodev.zapp.driver.DECLINE";
    private static final int ID_RESULT = 1003;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final String offerId = intent.getStringExtra("offerId");
        final String number = intent.getStringExtra("number");
        final boolean accept = ACCEPT.equals(intent.getAction());
        DriverService.silence(ctx);
        if (offerId == null) return;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            int code = 0;
            try {
                String token = ctx.getSharedPreferences("zapp_driver", Context.MODE_PRIVATE).getString("token", null);
                String base = ctx.getSharedPreferences("zapp_driver", Context.MODE_PRIVATE).getString("base", "https://zapp.prodev.cloud");
                if (token != null) {
                    HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/courier/offers/" + offerId + (accept ? "/accept" : "/decline")).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(10000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    c.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream os = c.getOutputStream()) {
                        os.write("{}".getBytes(StandardCharsets.UTF_8));
                    }
                    code = c.getResponseCode();
                    c.disconnect();
                }
            } catch (Exception ignored) {}
            if (accept) showResult(ctx, code >= 200 && code < 300, number);
            pending.finish();
        }).start();
    }

    private void showResult(Context ctx, boolean ok, String number) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, "zapp_online")
            .setSmallIcon(R.drawable.ic_stat_zapp)
            .setColor(0xFF4B1FE0)
            .setContentTitle(ok ? "✅ قبلت الطلب " + (number != null ? number : "") : "الطلب ما عاد متاح")
            .setContentText(ok ? "افتح التطبيق لتشوف التفاصيل والعنوان" : "يمكن انتهى وقت العرض أو أخده عامل تاني")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID_RESULT, b.build());
    }
}
