#! /usr/bin/env sh
git pull
git status
git add .
git commit . -m "update"
git push -u origin main
npm install
npm run build

set -e
cd dist
echo "已成功进入目录打包...正在进行打包"
zip -r ../zip/dist.zip ./
echo "已经成功打包"

echo "***** 上传中 *****"
scp -v -i ~/.ssh/id_rsa -r ../zip/dist.zip root@121.89.218.11:/www/wwwroot/ai.bornforthis.cn/ARGarden
echo "***** 成功上传 *****"
rm -rf ../zip/dist.zip
echo "***** 进入服务器，触发远端程序 *****"
# ssh root@121.89.218.11 "sh /bash/autounzip.sh"
ssh -i ~/.ssh/id_rsa root@121.89.218.11 "sh /www/wwwroot/bash/ARGarden.sh"
echo "***** 传输完毕*****"


npm run dev
