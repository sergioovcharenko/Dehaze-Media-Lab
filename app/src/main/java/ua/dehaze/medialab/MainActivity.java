package ua.dehaze.medialab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.net.Uri;
import android.media.MediaScannerConnection;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int CHOOSE_FILE = 211, ASK_CAMERA = 212;
    private WebView web;
    private android.webkit.ValueCallback<Uri[]> pendingFiles;
    private PermissionRequest pendingCamera;
    private WebViewAssetLoader assets;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams p = getWindow().getAttributes();
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(p);
        }
        immersive();
        assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        web.setBackgroundColor(0xff05080d);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setContentView(web);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if(!"https://appassets.androidplatform.net".equals(request.getOrigin().toString().replaceAll("/$", ""))) {
                        request.deny();return;
                    }
                    boolean video=false;
                    for(String s : request.getResources()) if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(s)) video=true;
                    if(!video){request.deny();return;}
                    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        pendingCamera=request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, ASK_CAMERA);
                    }
                });
            }
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles=callback;
                try { startActivityForResult(params.createIntent(), CHOOSE_FILE); return true; }
                catch(Exception e) { pendingFiles=null; callback.onReceiveValue(null); return false; }
            }
        });
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if(focus) immersive();
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code,result,data);
        if(code==CHOOSE_FILE && pendingFiles!=null){
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
            pendingFiles=null;
        }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==ASK_CAMERA && pendingCamera!=null){
            PermissionRequest r=pendingCamera;pendingCamera=null;
            if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED) r.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else r.deny();
        }
    }
    public class NativeBridge {
        @JavascriptInterface public void savePng(String base64,String requestedName){
            new Thread(() -> {
                try {
                    String data=base64.substring(base64.indexOf(',')+1);
                    byte[] png=Base64.decode(data,Base64.DEFAULT);
                    String name=requestedName.replaceAll("[^a-zA-Z0-9_.-]", "_");
                    if(!name.endsWith(".png")) name += ".png";
                    if(Build.VERSION.SDK_INT>=29){
                        ContentValues v=new ContentValues();
                        v.put(MediaStore.Images.Media.DISPLAY_NAME,name);
                        v.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
                        v.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/DehazeMediaLab");
                        Uri uri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,v);
                        if(uri==null) throw new Exception("MediaStore insert failed");
                        try(OutputStream o=getContentResolver().openOutputStream(uri)){if(o==null) throw new Exception("No write stream");o.write(png);}
                    } else {
                        File folder = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES),"DehazeMediaLab");
                        if(!folder.exists() && !folder.mkdirs())throw new Exception("Folder unavailable");
                        File f = new File(folder,name);
                        try(OutputStream o=new FileOutputStream(f)){o.write(png);}
                        MediaScannerConnection.scanFile(MainActivity.this,new String[]{f.getAbsolutePath()},new String[]{"image/png"},null);
                    }
                    runOnUiThread(()->Toast.makeText(MainActivity.this,"PNG збережено",Toast.LENGTH_SHORT).show());
                } catch(Exception e){runOnUiThread(()->Toast.makeText(MainActivity.this,"Не вдалося зберегти PNG",Toast.LENGTH_LONG).show());}
            }).start();
        }
        @JavascriptInterface public String getVersion(){return "1.6-auto3-smooth-playback";}
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("document.body.classList.contains('panel-open')", result -> {
            if("true".equals(result)) web.evaluateJavascript("document.body.classList.remove('panel-open')",null);
            else if(web.canGoBack())web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if(web!=null){web.loadUrl("about:blank");web.destroy();}
        super.onDestroy();
    }
}
