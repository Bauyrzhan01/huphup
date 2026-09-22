-- Banners carry their text inside the picture, so a title is no longer required.
ALTER TABLE "banners" ALTER COLUMN "title" DROP NOT NULL;
