from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]/'frontend/messages'
keys=['lookDeck','previousLook','nextLook','lookThumbnail','lookPieces','reuseLook','reuseHint','undoSelection','commandHint','commandRemoved','commandUndone','commandCleared','historyPhoto']
rows={
'zh-CN':['真人造型册','上一套试穿','下一套试穿','打开真人造型 {number}','这套用了哪些单品','沿用这套单品','只更新选衣；保留当前人物照片，点击生成后才会重新试穿。','撤销选衣','可说“脱掉外套”“撤销上一步”；选定单品后可接着说“换成白色”。语音仅调整选衣，生成由你点击。','已移除匹配单品。','已撤销上一次选衣。','已清空选择。','试穿记录 {number} 的照片'],
'zh-TW':['真人造型冊','上一套試穿','下一套試穿','開啟真人造型 {number}','這套用了哪些單品','沿用這套單品','只更新選衣；保留目前人物照片，點擊生成後才會重新試穿。','復原選衣','可說「脫掉外套」「復原上一步」；選定單品後可接著說「換成白色」。語音僅調整選衣，生成由你點擊。','已移除符合的單品。','已復原上一次選衣。','已清空選擇。','試穿紀錄 {number} 的照片'],
'en':['Photo lookbook','Previous try-on','Next try-on','Open photo look {number}','Pieces in this look','Use these pieces','Updates selection only. Keep your current person photo; press Generate to try it on.','Undo selection','Try “take off the jacket” or “undo”. After choosing a piece, try “how about white?”. Voice updates selection; press Generate yourself.','Matching piece removed.','Last selection change undone.','Selection cleared.','Photo for try-on {number}'],
'de':['Foto-Lookbook','Vorherige Anprobe','Nächste Anprobe','Foto-Look {number} öffnen','Teile dieses Looks','Diese Teile verwenden','Ändert nur die Auswahl. Das aktuelle Personenfoto bleibt; zum Anprobieren auf Generieren klicken.','Auswahl rückgängig','Befehle auf Chinesisch oder Englisch, z. B. „take off the jacket“ oder „undo“. Sprache ändert die Auswahl; die Generierung startest du selbst.','Passendes Teil entfernt.','Letzte Auswahländerung rückgängig gemacht.','Auswahl geleert.','Foto der Anprobe {number}'],
'fr':['Carnet de looks photo','Essayage précédent','Essayage suivant','Ouvrir le look photo {number}','Les pièces de ce look','Utiliser ces pièces','Modifie uniquement la sélection. La photo actuelle est conservée ; lancez la génération pour essayer.','Annuler la sélection','Commandes en chinois ou anglais, par exemple « take off the jacket » ou « undo ». La voix modifie la sélection ; vous lancez la génération.','Pièce correspondante retirée.','Dernière modification annulée.','Sélection effacée.','Photo de l’essayage {number}'],
'it':['Lookbook fotografico','Prova precedente','Prova successiva','Apri look fotografico {number}','Capi di questo look','Usa questi capi','Aggiorna solo la selezione. Mantiene la foto attuale; premi Genera per provarli.','Annulla selezione','Comandi in cinese o inglese, ad esempio “take off the jacket” o “undo”. La voce cambia la selezione; avvii tu la generazione.','Capo corrispondente rimosso.','Ultima modifica annullata.','Selezione svuotata.','Foto della prova {number}'],
'ja':['フォトルックブック','前の試着','次の試着','フォトルック {number} を開く','このコーデのアイテム','このアイテムを使う','選択のみ更新します。現在の人物写真を保持し、生成ボタンで試着を開始します。','選択を元に戻す','中国語・英語で「take off the jacket」「undo」などを入力できます。音声は選択のみ変更し、生成はボタンで開始します。','該当するアイテムを外しました。','前の選択に戻しました。','選択を解除しました。','試着 {number} の写真'],
'ko':['포토 룩북','이전 피팅','다음 피팅','포토 룩 {number} 열기','이 룩에 사용한 아이템','이 아이템 사용','선택만 변경합니다. 현재 인물 사진을 유지하며 생성 버튼으로 피팅을 시작합니다.','선택 되돌리기','중국어 또는 영어로 “take off the jacket”, “undo” 등을 말할 수 있습니다. 음성은 선택만 변경하며 생성은 버튼으로 시작합니다.','해당 아이템을 제거했습니다.','이전 선택으로 되돌렸습니다.','선택을 지웠습니다.','피팅 {number} 사진'],
}
for locale,values in rows.items():
 p=root/locale/'wardrobe.json'
 data=json.loads(p.read_text())
 data['fitting'].update(dict(zip(keys,values,strict=True)))
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
