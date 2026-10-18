# 已校验的模型资源封装

首次常规镜像中仅女模文件发生截断：GLB头声明18,729,540字节，实际17,072,128字节；本机完整文件与来源清单一致。具体底层截断原因未确定，不能仅凭源码标签判断发布完整。

此补充镜像复用已通过编译和类型校验的正式程序，用小于14MB的gzip文件封装完整女模；解压时必须通过完整SHA256校验，否则构建失败。不会复制文件到运行容器或修改用户数据。

从项目根目录复现（先完成正常前端构建）：

```sh
gzip -c frontend/public/models/avatar/v2/female.glb > verification/video-quality/asset-release/female.glb.gz
docker build -t wardrowbe-frontend:video-quality-20261018-r2 verification/video-quality/asset-release
./local.sh up -d --no-deps --no-build --pull never frontend
python3 verification/video-quality/release.py runtime
```

Dockerfile固定该次源模型的SHA256。后续修改模型必须更新来源清单与此校验值；禁止沿用旧值跳过验证。`female.glb.gz`是可重建中间产物，已忽略。运行校验会逐文件比对全部39个公开资源，随后校验558文件源码清单与镜像标签；只检查标签不足以通过。
