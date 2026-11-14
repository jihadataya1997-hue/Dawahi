package cloud.prodev.zapp.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZappDriverPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        DriverService.appVisible = true;
        // العامل فتح التطبيق: التطبيق نفسه بيعرض العرض، فمنوقف الرنّة
        DriverService.silence(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        DriverService.appVisible = false;
    }
}
