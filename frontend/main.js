// data.html から viewer.html への通信を中継するスクリプト
window.addEventListener("message", (event) => {
    // メッセージが存在して、かつ type が SELECT_SEAT のときだけ処理
    if (!event?.data || event.data.type !== "SELECT_SEAT") return;

    // 右側（viewer.html）を取得して、その中へ同じメッセージを転送
    const viewerFrame = document.getElementById("right");
    viewerFrame.contentWindow.postMessage(event.data, "*");
});
