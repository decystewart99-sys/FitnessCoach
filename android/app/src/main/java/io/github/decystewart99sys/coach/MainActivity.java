package io.github.decystewart99sys.coach;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthBridgePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
    }
}
